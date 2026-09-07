
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { Bot, InlineKeyboard } from 'grammy';

const BOT_TOKEN=process.env.BOT_TOKEN;
const GAME_URL=process.env.GAME_URL || 'https://alek.best/arena/';
const PORT=Number(process.env.PORT||3000);

if(!BOT_TOKEN) throw new Error('BOT_TOKEN is missing');

const bot=new Bot(BOT_TOKEN);
bot.command('start', async ctx=>{
  const kb=new InlineKeyboard().webApp('🎮 Play ALEK World', GAME_URL);
  await ctx.reply(
    'Welcome to ALEK World 🌍\nExplore, fight Raiders, gather resources, craft gear and build your base.',
    {reply_markup:kb}
  );
});
bot.command('play', async ctx=>{
  const kb=new InlineKeyboard().webApp('🌍 Open Game', GAME_URL);
  await ctx.reply('Enter ALEK World:',{reply_markup:kb});
});

await bot.api.setChatMenuButton({
  menu_button:{type:'web_app',text:'🎮 ALEK World',web_app:{url:GAME_URL}}
});

bot.start();

const app=express();
app.use(helmet());
app.get('/health',(_,res)=>res.json({ok:true,game:GAME_URL}));
app.listen(PORT,()=>console.log(`ALEK bot health server on ${PORT}`));
