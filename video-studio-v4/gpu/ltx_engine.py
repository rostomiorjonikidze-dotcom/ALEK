"""Local LTX-2.3 runner. No third-party inference endpoints.

This file builds and runs the *official* ltx_pipelines.distilled CLI, with the
required image-conditioning arguments. It cannot infer without licensed weights,
a powerful CUDA GPU, ffmpeg and an installed LTX-2 checkout.
"""
from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from PIL import Image, ImageOps
from voice import piper_sentence, extract_segment, media_duration, VoiceTooLong


class GPUNotReady(RuntimeError):
    pass


class GenerationError(RuntimeError):
    pass


@dataclass(frozen=True)
class ModelSettings:
    root: Path
    checkpoint: Path
    upscaler: Path
    gemma: Path
    dev_checkpoint: Path | None = None
    distilled_lora: Path | None = None
    piper_model: Path | None = None
    speech_mode: str = "native"  # LTX-native / Piper exact speech / upload conditioned
    uv: str = "uv"
    width: int = 512
    height: int = 896
    frame_rate: int = 24
    frames_per_clip: int = 121
    offload: str = "cpu"

    @classmethod
    def from_env(cls) -> "ModelSettings":
        root = Path(os.getenv("ALEK_LTX_ROOT", "/opt/LTX-2"))
        return cls(
            root=root,
            checkpoint=Path(os.getenv("ALEK_LTX_CHECKPOINT", str(root / "models/ltx-2.3/ltx-2.3-22b-distilled-1.1.safetensors"))),
            upscaler=Path(os.getenv("ALEK_LTX_UPSCALER", str(root / "models/ltx-2.3/ltx-2.3-spatial-upscaler-x2-1.1.safetensors"))),
            gemma=Path(os.getenv("ALEK_LTX_GEMMA", str(root / "models/gemma-3-12b"))),
            dev_checkpoint=Path(os.getenv("ALEK_LTX_DEV_CHECKPOINT",str(root / "models/ltx-2.3/ltx-2.3-22b-dev.safetensors"))),
            distilled_lora=Path(os.getenv("ALEK_LTX_DISTILLED_LORA",str(root / "models/ltx-2.3/ltx-2.3-22b-distilled-lora-384-1.1.safetensors"))),
            piper_model=Path(os.getenv("PIPER_MODEL", "/opt/voices/fr_FR-voice.onnx")),
            speech_mode=os.getenv("ALEK_SPEECH_MODE", "native"),
            offload=os.getenv("ALEK_LTX_OFFLOAD", "cpu"),
            width=int(os.getenv("ALEK_LTX_WIDTH", "512")),
            height=int(os.getenv("ALEK_LTX_HEIGHT", "896")),
            uv=os.getenv("ALEK_UV", "uv"),
        )

    def check(self, *, require_cuda: bool = True) -> list[str]:
        missing=[]
        if os.getenv("ALEK_LTX_LICENSE_ACCEPTED") != "yes":
            missing.append("Accept the official LTX-2.3 license and set ALEK_LTX_LICENSE_ACCEPTED=yes")
        if not (self.root / "pyproject.toml").is_file():
            missing.append("Missing official LTX-2 checkout (ALEK_LTX_ROOT)")
        if not self.checkpoint.is_file():missing.append("Missing model checkpoint")
        if not self.upscaler.is_file():missing.append("Missing spatial upscaler")
        if not self.gemma.is_dir() or not any(self.gemma.iterdir()):missing.append("Missing Gemma-3 encoder")
        if not shutil.which(self.uv):missing.append("Missing uv binary")
        if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):missing.append("Missing ffmpeg / ffprobe")
        if self.width % 64 or self.height % 64:
            missing.append("Resolution must be a multiple of 64")
        if self.offload not in {"none", "cpu", "disk"}:
            missing.append("Invalid model offload mode")
        if self.speech_mode not in {"native", "piper", "uploaded"}:
            missing.append("Invalid speech_mode (native, piper or uploaded)")
        if self.speech_mode == "piper":
            if not shutil.which("piper"):missing.append("Piper CLI missing")
            if not self.piper_model or not self.piper_model.is_file():missing.append("French Piper ONNX voice missing")
        if self.speech_mode in {"piper", "uploaded"}:
            if not self.dev_checkpoint or not self.dev_checkpoint.is_file():missing.append("LTX-2.3 dev model missing for audio conditioned pipeline")
            if not self.distilled_lora or not self.distilled_lora.is_file():missing.append("LTX distilled LoRA missing for audio conditioned pipeline")
        if require_cuda:
            try:
                r=subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
                                 capture_output=True, text=True, timeout=6, check=False)
                if r.returncode or not r.stdout.strip():missing.append("No visible CUDA NVIDIA GPU")
            except (FileNotFoundError, subprocess.TimeoutExpired):
                missing.append("No visible CUDA NVIDIA GPU")
        return missing

    def command(self, image: Path, prompt: str, output: Path, seed: int = 41, audio: Path | None = None) -> list[str]:
        """Verified against official LTX-2.3 CLI parser: --image PATH FRAME_IDX STRENGTH."""
        if not image.is_file():raise FileNotFoundError(image)
        if not 12 <= len(prompt) <= 2400:raise ValueError("Prompt must be 12–2400 characters")
        if self.offload not in {"none", "cpu", "disk"}:raise ValueError("Invalid offload mode")
        common = [self.uv, "run", "python", "-m", "ltx_pipelines.distilled",
                "--distilled-checkpoint-path", str(self.checkpoint),
                "--spatial-upsampler-path", str(self.upscaler),
                "--gemma-root", str(self.gemma),
                "--image", str(image), "0", "1.0",
                "--height", str(self.height), "--width", str(self.width),
                "--num-frames", str(self.frames_per_clip), "--frame-rate", str(self.frame_rate),
                "--seed", str(seed), "--offload", self.offload,
                "--output-path", str(output), "--prompt", prompt]
        if not audio:
            return common
        if self.speech_mode not in {"piper", "uploaded"} or not self.dev_checkpoint or not self.distilled_lora:
            raise ValueError("Audio-conditioned inference is not configured")
        if not audio.is_file():raise FileNotFoundError(audio)
        # Official LTX-2.3 A2VidTwoStage accepts image conditioning and an input audio.
        # It requires the dev checkpoint & a distilled LoRA in addition to the
        # distilled text/image model, and preserves the supplied audio waveform.
        args = [self.uv, "run", "python", "-m", "ltx_pipelines.a2vid_two_stage",
                "--checkpoint-path",str(self.dev_checkpoint),
                "--distilled-lora",str(self.distilled_lora),"0.8",
                "--spatial-upsampler-path",str(self.upscaler),
                "--gemma-root",str(self.gemma),
                "--image",str(image),"0","1.0",
                "--audio-path",str(audio),"--audio-max-duration","5",
                "--height",str(self.height),"--width",str(self.width),
                "--num-frames",str(self.frames_per_clip),"--frame-rate",str(self.frame_rate),
                "--num-inference-steps","30","--seed",str(seed),
                "--offload",self.offload,"--output-path",str(output),"--prompt",prompt]
        return args


def synthesize_french_voice(text: str, destination: Path, workspace: Path, model: Path) -> None:
    """Convert exact French text into locally synthesized audio for LTX A2V.

    Piper is an optional open-source executable running on the GPU owner's host.
    """
    if not text.strip():raise ValueError("Empty narration for Piper speech")
    tmp=workspace/"piper_raw.wav"
    try:
        command=["piper","--model",str(model),"--output_file",str(tmp)]
        r=subprocess.run(command,input=text,encoding="utf-8",capture_output=True,timeout=120)
    except (subprocess.TimeoutExpired,FileNotFoundError) as e:
        raise GenerationError("Local French voice engine unavailable") from e
    if r.returncode or not tmp.is_file():
        raise GenerationError("Piper failed to generate French speech")
    # Keep speech at 5 seconds per shot. Long scripts need fewer words per scene.
    run_ffmpeg(["-i",str(tmp),"-af","apad=pad_dur=5", "-ar","48000", "-ac","2","-t","5",str(destination)],timeout=90)


def normalize_reference(image: Path, destination: Path, size=(512,896)) -> None:
    """Crop once: source pose and clothes are preserved without fake inpainting."""
    with Image.open(image) as source:
        if source.width*source.height>32_000_000:
            raise ValueError("Image pixel count too high")
        im=ImageOps.exif_transpose(source).convert("RGB")
        im=ImageOps.fit(im, size, method=Image.Resampling.LANCZOS, centering=(.5,.42))
        im.save(destination, "JPEG", quality=94, subsampling=0)


def shot_prompts(base: str, speech: str, clips: int) -> list[str]:
    """Split speech on word boundaries for multiple 5-second shots.
    Word counts are only approximate; the generator may omit or alter speech.
    """
    import re
    base=" ".join(base.strip().split())[:1100]
    words=speech.strip().split()
    # prevent prompt exceeding model's useful attention range
    words=words[:60]
    chunks=[" ".join(words[i*len(words)//clips:(i+1)*len(words)//clips]) for i in range(clips)]
    stages=[
        "The creator faces the phone camera, naturally smiles, and introduces the dress with subtle hand gestures.",
        "The creator gently turns halfway and demonstrates how the fabric and ruffled hem move. Human anatomy stays natural.",
        "The creator returns to the lens and clearly invites viewers to visit the fashion shop. She smiles at the end.",
    ]
    return [f"{base} {stages[min(i,2)]}"
            + (f' The woman speaks naturally in metropolitan French, audibly saying: « {chunks[i]} ». Her lips move in sync with these spoken words.' if chunks[i] else ' Natural room ambience, no speech.')
            + " Photorealistic fashion UGC footage recorded on a modern phone, truthful garment texture and body physics, stable face identity, correct hands, continuous 24 fps motion, no on-screen text, no subtitles, no watermarks."
            for i in range(clips)]


def probe(path: Path) -> dict:
    import json
    r=subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name",
                      "-of", "json", str(path)], capture_output=True,text=True,timeout=45)
    if r.returncode:raise GenerationError("Output failed FFprobe validation")
    try: data=json.loads(r.stdout)
    except ValueError as e:raise GenerationError("Bad FFprobe response") from e
    if "video" not in [s.get("codec_type") for s in data.get("streams",[])]:
        raise GenerationError("AI output does not contain a video stream")
    try: duration=float(data["format"]["duration"])
    except (KeyError,ValueError) as e:raise GenerationError("AI output duration missing") from e
    if not 3 < duration < 30:raise GenerationError("AI output duration is outside expected range")
    return data


def run_ffmpeg(args: list[str], timeout: int = 300) -> None:
    p=subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args],
                     capture_output=True, text=True, timeout=timeout)
    if p.returncode:raise GenerationError("Video post-processing error: " + p.stderr[-500:])


def generate(
    *, image: Path, speech: str, prompt: str, output: Path, workspace: Path,
    seconds: int=5, brand: str="ALEK SHOP", website: str="shop.alek.best",
    audio_source: Path | None=None, on_status: Callable[[str],None] | None=None,
    settings: ModelSettings | None=None,
) -> None:
    if seconds not in {5,10,15}:raise ValueError("Duration must be 5, 10 or 15 seconds")
    settings=settings or ModelSettings.from_env()
    missing=settings.check()
    if missing:raise GPUNotReady("; ".join(missing))
    if len(speech)>500:raise ValueError("Narration too long")
    if settings.speech_mode == "uploaded" and not audio_source:
        raise ValueError("Audio-conditioned mode requires uploaded narration")
    if len(prompt)>1300:raise ValueError("Prompt too long")
    if not on_status:on_status=lambda _:None
    workspace.mkdir(parents=True, exist_ok=True)
    ref=workspace / "reference_0.jpg"
    normalize_reference(image,ref,(settings.width,settings.height))
    clips=seconds//5
    scenes=shot_prompts(prompt,speech,clips)
    processed=[]
    for i,scene in enumerate(scenes):
        on_status(f"Rendu IA : scène {i+1}/{clips}")
        generated=workspace/f"generated_{i}.mp4"
        voice=None
        if settings.speech_mode == "piper" and speech.strip():
            import re
            match=re.search(r"« (.*?) »",scene)
            if match:
                voice=workspace/f"french_speech_{i}.wav"
                piper_sentence(match.group(1),voice,piper_model=settings.piper_model)
        elif settings.speech_mode == "uploaded" and audio_source:
            voice=workspace/f"uploaded_speech_{i}.wav"
            extract_segment(audio_source,voice,i)
        cmd=settings.command(ref,scene,generated,seed=41+i,audio=voice)
        try:
            with (workspace/f"ltx_{i}.log").open("wb") as log:
                subprocess.run(cmd,cwd=settings.root,stdout=log,stderr=subprocess.STDOUT,
                               timeout=3600,check=True)
        except subprocess.TimeoutExpired as e:
            raise GenerationError("LTX inference exceeded 60 minutes per shot") from e
        except subprocess.CalledProcessError as e:
            raise GenerationError(f"LTX inference failed in shot {i+1}; see GPU server log") from e
        if not generated.is_file() or generated.stat().st_size<1024:
            raise GenerationError("LTX did not produce an MP4")
        meta=probe(generated)
        video=workspace/f"clip_{i}.mp4"
        # Ensure clips have compatible output tracks; preserve generated audio if present.
        has_audio=any(s.get("codec_type")=="audio" for s in meta.get("streams",[]))
        audio_args=["-c:a", "aac", "-b:a", "128k"] if has_audio else ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
        if has_audio:
            run_ffmpeg(["-i",str(generated),"-vf",f"fps=24,tpad=stop_mode=clone:stop_duration=1,scale={settings.width}:{settings.height},format=yuv420p", "-t","5", "-c:v","libx264","-preset","fast","-crf","19",*audio_args,"-ar","48000", "-ac","2", "-af","apad=whole_dur=5",str(video)])
        else:
            run_ffmpeg(["-i",str(generated),*audio_args,"-vf",f"fps=24,tpad=stop_mode=clone:stop_duration=1,scale={settings.width}:{settings.height},format=yuv420p", "-t","5", "-c:v","libx264","-preset","fast","-crf","19","-c:a","aac", "-af","apad=whole_dur=5",str(video)])
        processed.append(video)
        if i<clips-1:
            next_ref=workspace/f"reference_{i+1}.jpg"
            run_ffmpeg(["-sseof","-0.2","-i",str(video),"-frames:v","1",str(next_ref)],timeout=60)
            if not next_ref.exists():raise GenerationError("Could not extract next-scene reference")
            ref=next_ref
    on_status("Montage final et identité de marque")
    concat=workspace/"shots.txt"
    # paths are local trusted temp files; ffmpeg concat demuxer quoting handles spaces
    concat.write_text("".join(f"file '{str(f).replace(chr(39), chr(39)+chr(92)+chr(39)+chr(39))}'\n" for f in processed))
    stitched=workspace/"merged.mp4"
    run_ffmpeg(["-f","concat","-safe","0","-i",str(concat),"-c","copy",str(stitched)],timeout=120)
    # All branded typography is deterministic, not AI generated.
    brand=brand.replace("\n"," ")[:45]
    website=website.replace("\n"," ")[:60]
    (workspace/"brand.txt").write_text(brand,encoding="utf-8")
    (workspace/"website.txt").write_text(website,encoding="utf-8")
    font=os.getenv("ALEK_FONT","/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
    if not Path(font).exists():raise GPUNotReady("Required overlay font is missing: set ALEK_FONT")
    font=font.replace(":","\\:")
    b=(workspace/"brand.txt").as_posix().replace(":","\\:")
    w=(workspace/"website.txt").as_posix().replace(":","\\:")
    overlay=(f"drawbox=x=0:y=ih*0.80:w=iw:h=ih*0.20:color=black@0.65:t=fill:enable='gte(t,{max(0,seconds-2.7)})',"
             f"drawtext=fontfile='{font}':textfile='{b}':fontcolor=white:fontsize=35:x=w*0.06:y=h*0.85:enable='gte(t,{max(0,seconds-2.7)})',"
             f"drawtext=fontfile='{font}':textfile='{w}':fontcolor=0x5baeff:fontsize=26:x=w*0.06:y=h*0.91:enable='gte(t,{max(0,seconds-2.7)})'")
    run_ffmpeg(["-i",str(stitched),"-vf",overlay,"-t",str(seconds),"-c:v","libx264","-preset","fast","-crf","19", "-c:a","copy","-movflags","+faststart",str(output)], timeout=220)
    final=probe(output)
    if abs(float(final["format"]["duration"])-seconds)>0.5:
        raise GenerationError("Final duration outside tolerance")
    on_status("Terminé")