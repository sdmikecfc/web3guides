/** Native Higgsedit composition. Run with DK_FILM_INPUTS/DK_FILM_PROJECT paths.
 * The temporary key plate is replaced with the local gameplay asset in delivery.
 * No paid image/video generation is invoked by this edit.
 */
import {execFileSync} from 'node:child_process';
export default async ({project,text,rect,media,frame})=>{
 const input=process.env.DK_FILM_INPUTS??'/home/user/inputs',dir=process.env.DK_FILM_PROJECT??'/home/user/dk-packs-v2';
 const p=await project({dir,size:'1920x1080',fps:30,background:'#123f37'});
 const fontPath=execFileSync('fc-match',['-f','%{file}','Montserrat:style=Bold'],{encoding:'utf8'}).trim();const font=await p.add(fontPath);
 const cream='#fff2d6',gold='#f5c768',ink='#123f37';
 const tx=(s,x,y,w,h,size=48,color=cream)=>text(s,{x,y,width:w,height:h,fontSize:size,color,fontFamily:'Montserrat',fontWeight:700,typography:{fontAssetId:font.id}});
 const move=(delay=0)=>({enter:{from:{y:20,opacity:0},at:delay,duration:.34},exit:{to:{opacity:0},duration:.14,anchor:'end'}});
 const nodes=(children,at,dur,name)=>p.compose(frame({x:0,y:0,width:1920,height:1080,layout:'none'},children),{at,dur,name});
 const intro=[];for(let i=0;i<4;i++)intro.push(await p.add(`${input}/shot-${i}.mp4`));
 p.cut(intro[0],{at:0,from:0,dur:5,fit:'cover'});for(let i=1;i<4;i++)p.cut(intro[i],{at:5+(i-1)*4,from:0,dur:4,fit:'cover'});
 const shade=()=>rect({x:0,y:720,width:1920,height:360,fill:{kind:'linear',angle:180,stops:[{offset:0,color:'#082e28',opacity:0},{offset:1,color:'#082e28',opacity:.97}]}});
 nodes([shade(),frame({x:95,y:830,width:1720,height:180,layout:'none',motion:move()},[
  rect({x:0,y:0,width:815,height:150,radius:24,fill:cream}),tx('REGULAR',30,25,360,58,44,ink),tx('5 USDC',440,40,350,85,64,ink),
  rect({x:865,y:0,width:815,height:150,radius:24,fill:gold}),tx('SUPER',895,25,360,58,44,ink),tx('10 USDC',1290,40,370,85,64,ink),
 ])],0,5,'Regular and Super proposed prices');
 const titles=['Dragonfire Grill','Disco Burger Jukebox','Lucky Cat Soda Fountain'];
 for(let i=0;i<3;i++)nodes([shade(),frame({x:95,y:838,width:1730,height:170,layout:'none',motion:move(.15)},[tx('COLLECT SOMETHING EXTRAORDINARY',0,0,1700,45,30,gold),tx(titles[i],0,54,1700,100,76)])],5+i*4,4,titles[i]+' cinematic reveal');
 const gameplay=await p.add(`${input}/gameplay-placeholder.mp4`);
 // Caption frames share the picture's composition, so automatic track allocation
 // cannot tuck a title beneath the opaque gameplay background.
 const gameplayTitles=[[0,4.5,'Dress your\nDragonfire Grill.','Same machine.\nEvery upgrade stays.'],[4.5,4.5,'Place your\nDisco Burger\nJukebox.','A little character\nfor your restaurant.'],[9,5,'Make the Lucky\nCat Fountain\nyours.','Equipment skins dress\nmachines you own.']].map(([at,duration,title,detail])=>frame({x:80,y:275,width:465,height:600,layout:'none',at,duration,motion:move()},[tx(title,0,0,460,320,54),tx(detail,0,350,455,140,34,gold)]));
 nodes([rect({x:0,y:0,width:1920,height:1080,fill:ink}),rect({x:557,y:177,width:1286,height:726,radius:18,fill:gold}),media({file:gameplay,x:560,y:180,width:1280,height:720,fit:'contain'}),tx('REAL GAME CAPTURE',565,938,1240,60,35,gold),...gameplayTitles],17,14,'Playable collectibles');
 nodes([tx('12 Regular. 12 Super.',95,160,1740,130,90),tx('Decorations + equipment appearances',100,320,1730,90,51,gold),
  frame({x:100,y:485,width:1720,height:310,layout:'none',motion:move(.15)},[
   rect({x:0,y:0,width:820,height:280,radius:28,fill:cream}),tx('LUCKY CAT\nSODA FOUNTAIN',35,30,750,145,53,ink),tx('Regular · Common · 16%',35,202,750,65,37,ink),
   rect({x:875,y:0,width:820,height:280,radius:28,fill:gold}),tx('DRAGONFIRE\nGRILL',910,30,750,145,53,ink),tx('Super · Common · 16%',910,202,750,65,37,ink)]),tx('Collect it. Place it. Make it yours.',100,896,1720,90,60)
 ],31,4,'The two twelve-item collections');
 const rarities=[['Common','16% each'],['Uncommon','8.5% each'],['Rare','1.19%'],['Epic','0.5%'],['Legendary','0.3%'],['Mythic','0.01%']];
 nodes([tx('Six rarities. Every item has a home.',95,170,1750,130,70),...rarities.map(([name,odds],i)=>frame({x:100+i%3*575,y:360+Math.floor(i/3)*218,width:540,height:188,layout:'none',motion:move(i*.04)},[rect({x:0,y:0,width:540,height:188,radius:24,fill:i>3?gold:cream}),tx(name,28,22,490,70,48,ink),tx(odds,28,97,490,65,44,ink)])),tx('Exact odds shown before opening.',100,875,1710,85,54,gold)],35,4,'Published rarity odds per item');
 const board=(title,x,rows)=>frame({x,y:342,width:805,height:490,layout:'none',motion:move()},[rect({x:0,y:0,width:805,height:490,radius:28,fill:cream}),tx(title,35,28,735,75,49,ink),tx('VERIFIED OPENINGS',35,125,725,55,28,ink),...rows.map(([name,count],i)=>frame({x:35,y:207+i*83,width:730,height:65,layout:'none'},[tx(`${i+1}   ${name}`,0,0,510,65,39,ink),tx(String(count),565,0,170,65,45,ink)]))]);
 nodes([tx('Two packs. Two leaderboards.',95,161,1740,140,78),board('REGULAR',100,[['LunchHero',24],['NoodlePilot',18],['TinyDiner',12]]),board('SUPER',1015,[['NoodlePilot',16],['TinyDiner',11],['LunchHero',8]]),tx('ILLUSTRATIVE STANDINGS · Ranked by verified pack openings',100,905,1720,90,33,gold)],39,7,'Illustrative separate pack opening leaderboards');
 nodes([tx('Keep the collectible NFT.',95,225,1740,140,83),tx('Use it in your restaurant.',95,422,1740,145,83,gold),tx('Your connected wallet. Your collection. Your style.',100,730,1730,100,48)],46,3.5,'Keep NFT and use in the restaurant');
 nodes([tx('Or redeem it.',95,195,1740,130,90),frame({x:100,y:405,width:1710,height:300,layout:'none',motion:move()},[
  rect({x:0,y:0,width:810,height:265,radius:26,fill:cream}),tx('REGULAR',35,30,740,65,42,ink),tx('4.99 USDC',35,124,740,108,76,ink),
  rect({x:895,y:0,width:810,height:265,radius:26,fill:gold}),tx('SUPER',930,30,740,65,42,ink),tx('9.98 USDC',930,124,740,108,76,ink)]),tx('Proposed launch returns · Purchasing and redemption are not live',100,813,1720,130,39)],49.5,3.5,'Proposed redemption values corrected');
 nodes([tx('DOMAIN KITCHEN',100,296,1720,180,122),tx('Collect it. Place it. Make it yours.',100,515,1720,105,64,gold),tx('domainkitchen.xyz',100,754,1710,110,76)],53,2,'Domain Kitchen closing address');
 nodes([rect({x:80,y:55,width:370,height:65,radius:16,fill:'#102f29'}),tx('TEAM CONCEPT',103,68,340,46,30,cream)],0,55,'Persistent team concept designation');
 await p.frame(36,`${dir}/rarities.png`);await p.frame(42,`${dir}/leaderboards.png`);await p.render(`${dir}/visual-master.mp4`,{bitrate:16_000_000,concurrency:2});
};
