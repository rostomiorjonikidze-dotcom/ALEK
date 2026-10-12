"""ALEK local private GPU API for genuine image-to-video generation.

Launch on an operator-owned GPU host. It makes no calls to hosted generation APIs.
Authenticated jobs, bounded queue, expiring downloads, and explicit readiness checks.
"""
from __future__ import annotations

import hmac
import os
import re
import secrets
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, replace
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

from ltx_engine import GenerationError, GPUNotReady, ModelSettings, generate
from tryon import TryOnFailed, TryOnNotReady, check as tryon_check, try_on
from prepare import prepare_person

@asynccontextmanager
async def lifespan(app):
    yield
    workers.shutdown(wait=False,cancel_futures=True)

app=FastAPI(title="ALEK Real Video GPU Service",version="3.0.0",docs_url=None,redoc_url=None,lifespan=lifespan)
allowed=os.getenv("ALEK_ALLOWED_ORIGINS","https://video.alek.best,http://localhost:3000").split(',')
app.add_middleware(CORSMiddleware,allow_origins=[o.strip() for o in allowed if o.strip()],allow_methods=["GET","POST"],allow_headers=["X-ALEK-KEY","Content-Type"],max_age=600)
work_root=Path(os.getenv("ALEK_WORKDIR","/tmp/alek-ai-jobs")).resolve()
MAX_ACTIVE=2
EXPIRES_SECONDS=3600
MAX_IMAGE_BYTES=12*1024*1024
MAX_AUDIO_BYTES=20*1024*1024
workers=ThreadPoolExecutor(max_workers=1,thread_name_prefix="alek-ltx")
lock=threading.RLock()

@dataclass
class Job:
    id: str
    created: float
    status: Literal["queued","running","finished","failed"]="queued"
    progress: str="En attente du GPU"
    error: str|None=None
    completed: float|None=None

jobs:dict[str,Job]={}

class JobPublic(BaseModel):
    id:str
    status:str
    progress:str
    download_url:str|None=None
    error:str|None=None


def require_key(x_alek_key:Annotated[str|None,Header(alias="X-ALEK-KEY")]=None)->None:
    key=os.getenv("ALEK_GPU_KEY","")
    if len(key)<24:
        raise HTTPException(503,"GPU server authentication is not configured")
    if not x_alek_key or not hmac.compare_digest(x_alek_key,key):
        raise HTTPException(401,"Invalid GPU access key")


def readiness()->list[str]:
    errors=replace(ModelSettings.from_env(),speech_mode="native").check()
    if len(os.getenv("ALEK_GPU_KEY",""))<24:errors.insert(0,"GPU API key missing or too short")
    return errors

@app.get("/api/real/health")
def health():
    problems=readiness()
    with lock:
        active=sum(j.status in ("queued","running") for j in jobs.values())
    s=ModelSettings.from_env()
    voice_ready = not replace(s,speech_mode="piper").check()
    upload_ready = not replace(s,speech_mode="uploaded").check()
    return {"service":"alek-real-gpu","version":"3.0.0","ready":not problems,
            "model":"LTX-2.3 distilled (local)","reason":problems,"active_jobs":active,
            "max_active_jobs":MAX_ACTIVE,"max_duration_seconds":15,
            "capabilities":{"image_to_video":not problems,"garment_tryon":not tryon_check(),
                            "generated_french_voice":voice_ready,"prerecorded_french_audio":upload_ready},
            "requires_gpu":True}


def clean_old() -> None:
    now=time.time()
    with lock:
        expired=[k for k,v in jobs.items() if v.status in ("finished","failed") and v.completed and now-v.completed>EXPIRES_SECONDS]
        for key in expired:
            jobs.pop(key,None)
            shutil.rmtree(work_root/key,ignore_errors=True)


def update(j:Job,*,status:str|None=None,progress:str|None=None,error:str|None=None)->None:
    with lock:
        if status:j.status=status
        if progress:j.progress=progress
        if error:j.error=error
        if status in ("finished","failed"):j.completed=time.time()


def run_job(j:Job, image:Path,prompt:str,speech:str,seconds:int,brand:str,website:str,
            garment:Path|None=None, category:str="one-pieces",garment_photo_type:str="model",
            speech_mode:str="native", audio_source:Path|None=None, sheet_mode:str="single")->None:
    outdir=work_root/j.id
    try:
        update(j,status="running",progress="Préparation des références…")
        source_image=outdir/"prepared_model.jpg"
        prepare_person(image,source_image,sheet_mode=sheet_mode)
        if garment:
            update(j,progress="Essayage virtuel FASHN : modèle + vêtement")
            source_image=outdir/"fashn_outfit.png"
            try_on(outdir/"prepared_model.jpg",garment,source_image,category=category,garment_photo_type=garment_photo_type)
        update(j,progress="Génération par le modèle LTX-2.3")
        settings=replace(ModelSettings.from_env(),speech_mode=speech_mode)
        generate(image=source_image,speech=speech,prompt=prompt,output=outdir/"result.mp4",
                 workspace=outdir,seconds=seconds,brand=brand,website=website,
                 settings=settings,audio_source=audio_source,
                 on_status=lambda msg:update(j,progress=msg))
        # Keep only rendered output; reference and logs are deleted.
        for p in outdir.iterdir():
            if p.name!="result.mp4":
                if p.is_file():p.unlink(missing_ok=True)
                elif p.is_dir():shutil.rmtree(p,ignore_errors=True)
        update(j,status="finished",progress="Vidéo MP4 prête")
    except Exception as exc:
        # Do not leak internal GPU host paths or stacktraces to anonymous callers.
        msg=(str(exc)[:170] if isinstance(exc,(GenerationError,GPUNotReady,TryOnFailed,TryOnNotReady,ValueError)) else "Échec de génération : consultez les journaux du GPU")
        update(j,status="failed",progress="Erreur",error=msg)
        shutil.rmtree(outdir,ignore_errors=True)


@app.post("/api/real/jobs",response_model=JobPublic,status_code=202,dependencies=[Depends(require_key)])
async def create_job(
    image:Annotated[UploadFile,File()],
    prompt:Annotated[str,Form(min_length=12,max_length=1300)],
    narration:Annotated[str,Form(max_length=500)]="Les filles, découvrez cette jolie robe ! Retrouvez-la sur ALEK SHOP.",
    seconds:Annotated[int,Form(ge=5,le=15)]=5,
    brand:Annotated[str,Form(max_length=45)]="ALEK SHOP",
    website:Annotated[str,Form(max_length=60)]="shop.alek.best",
    garment:UploadFile|None=File(None),
    narration_audio:UploadFile|None=File(None),
    category:Annotated[Literal["tops","bottoms","one-pieces"],Form()]="one-pieces",
    garment_photo_type:Annotated[Literal["model","flat-lay"],Form()]="model",
    speech_mode:Annotated[Literal["native","piper","uploaded"],Form()]="native",
    consent:Annotated[bool,Form()]=False,
    sheet_mode:Annotated[Literal["single","two-panel-right"],Form()]="single",
):
    clean_old()
    if not consent:
        raise HTTPException(422,"Confirm rights/consent to use the person and garment images")
    if seconds not in (5,10,15):raise HTTPException(422,"Durée invalide : 5, 10 ou 15 secondes")
    problems=replace(ModelSettings.from_env(),speech_mode=speech_mode).check()
    if garment:problems+=tryon_check()
    if problems:raise HTTPException(503,{"message":"GPU/model not ready","missing":problems})
    if speech_mode=="uploaded" and not narration_audio:
        raise HTTPException(422,"Upload a licensed French narration audio file for audio-conditioned generation")
    if image.content_type not in {"image/jpeg","image/png","image/webp"}:
        raise HTTPException(415,"Upload JPG, PNG or WebP")
    if garment and garment.content_type not in {"image/jpeg","image/png","image/webp"}:
        raise HTTPException(415,"Garment must be JPG, PNG or WebP")
    if narration_audio and narration_audio.content_type not in {"audio/mpeg","audio/mp3","audio/wav","audio/x-wav","audio/mp4","audio/x-m4a","audio/ogg","application/octet-stream"}:
        raise HTTPException(415,"Unsupported narration audio type")
    if not re.fullmatch(r"[a-zA-Z0-9.-]{3,60}",website):raise HTTPException(422,"Invalid brand domain")
    with lock:
        if sum(j.status in ("queued","running") for j in jobs.values())>=MAX_ACTIVE:
            raise HTTPException(429,"GPU queue is full. Try again after a job finishes.")
        j=Job(id=uuid4().hex,created=time.time())
        jobs[j.id]=j
    work_root.mkdir(parents=True,exist_ok=True)
    target=work_root/j.id
    target.mkdir(mode=0o700)
    photo=target/"input.jpg"
    try:
        n=0
        with photo.open("wb") as dest:
            while content:=await image.read(1024*1024):
                n+=len(content)
                if n>MAX_IMAGE_BYTES:raise HTTPException(413,"Photo larger than 12 MB")
                dest.write(content)
        if not n:raise HTTPException(400,"Empty photo")
        # File *content* is decoded and validated; never trust mimetype alone.
        from PIL import Image,UnidentifiedImageError
        try:
            with Image.open(photo) as im:
                im.verify()
            with Image.open(photo) as im:
                if im.width*im.height>32_000_000:
                    raise HTTPException(413,"Image resolution exceeds 32 megapixels")
        except (UnidentifiedImageError,OSError,ValueError):raise HTTPException(400,"Invalid image file")
        dressed=None
        if garment:
            dressed=target/"garment.jpg"
            await validated_image(garment,dressed)
        audio_source=None
        if narration_audio:
            audio_source=target/"narration_audio"
            await store_upload(narration_audio,audio_source,MAX_AUDIO_BYTES)
            # ffprobe must be able to identify a legitimate audio stream
            import subprocess,json
            check=subprocess.run(["ffprobe","-v","error","-select_streams","a:0",
                                  "-show_entries","stream=codec_type","-of","json",str(audio_source)],
                                  capture_output=True,text=True,timeout=20)
            if check.returncode or "audio" not in check.stdout:
                raise HTTPException(400,"Invalid or corrupt audio upload")
            from voice import media_duration
            length=media_duration(audio_source)
            if length < seconds-0.75:
                raise HTTPException(422,"French narration audio is shorter than the selected video duration")
            if length > 60:
                raise HTTPException(422,"French narration audio is longer than 60 seconds")
        workers.submit(run_job,j,photo,prompt,narration,seconds,brand,website,
                       dressed,category,garment_photo_type,speech_mode,audio_source,sheet_mode)
        return public(j)
    except Exception:
        with lock:jobs.pop(j.id,None)
        shutil.rmtree(target,ignore_errors=True)
        raise


async def store_upload(file: UploadFile, destination:Path, max_bytes:int)->None:
    n=0
    with destination.open("wb") as fd:
        while data:=await file.read(1024*1024):
            n+=len(data)
            if n>max_bytes:raise HTTPException(413,"Uploaded media exceeds limit")
            fd.write(data)
    if not n:raise HTTPException(400,"Empty uploaded media")


async def validated_image(file:UploadFile,destination:Path)->None:
    await store_upload(file,destination,MAX_IMAGE_BYTES)
    from PIL import Image,UnidentifiedImageError
    try:
        with Image.open(destination) as im:
            im.verify()
        with Image.open(destination) as im:
            if im.width*im.height>32_000_000:
                raise HTTPException(413,"Image resolution exceeds 32 megapixels")
    except (UnidentifiedImageError,OSError,ValueError):
        raise HTTPException(400,"Invalid image upload")


def public(j:Job)->JobPublic:
    return JobPublic(id=j.id,status=j.status,progress=j.progress,
                     download_url=f"/api/real/jobs/{j.id}/video" if j.status=="finished" else None,
                     error=j.error)

@app.get("/api/real/jobs/{job_id}",response_model=JobPublic,dependencies=[Depends(require_key)])
def job_status(job_id:str):
    clean_old()
    with lock:j=jobs.get(job_id)
    if not j:raise HTTPException(404,"Job absent ou expiré")
    return public(j)

@app.get("/api/real/jobs/{job_id}/video",dependencies=[Depends(require_key)])
def job_video(job_id:str):
    clean_old()
    with lock:j=jobs.get(job_id)
    if not j or j.status!="finished":raise HTTPException(404,"Video not available")
    path=work_root/j.id/"result.mp4"
    if not path.is_file():raise HTTPException(404,"Rendered video missing")
    return FileResponse(path,media_type="video/mp4",filename="ALEK_REAL_VIDEO.mp4")
