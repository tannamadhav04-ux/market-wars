'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, methods: ['GET','POST'] } });
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req,res) => res.json({ok:true, app:'MARKET WARS', rooms: rooms.size}));

const START_CASH = 1_000_000;
const MIN_PLAYERS = 2, MAX_PLAYERS = 8, TOTAL_ROUNDS = 10, ROUND_SECONDS = 180;
const STOCKS = [
 ['RELIANCE',1450],['HDFCBANK',1720],['ICICIBANK',1280],['TCS',3450],['INFY',1520],['SBIN',825],['ITC',438],['LT',3620],['BHARTIARTL',1580],['AXISBANK',1120],['TATAMOTORS',970],['MARUTI',12400],['SUNPHARMA',1680],['WIPRO',510],['ONGC',285],['NTPC',390],['ADANIPORTS',1420],['HINDUNILVR',2480],['BAJFINANCE',7200],['TATASTEEL',165]
];
const rooms = new Map();
const money = n => Math.round(n);
const makeId = () => crypto.randomBytes(8).toString('hex');
const makeCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const makeMarket = () => Object.fromEntries(STOCKS.map(([symbol,price]) => [symbol,{symbol,price,previous:price,change:0,volume:Math.floor(100000+Math.random()*900000),history:[price]}]));
const portfolioValue = (p,r) => p.cash + Object.entries(p.holdings).reduce((sum,[s,q]) => sum + q*r.market[s].price,0);
const publicPlayer = (p,r) => ({id:p.id,name:p.name,online:p.online,portfolioValue:money(portfolioValue(p,r)),isHost:p.id===r.hostId});
function snapshot(r, viewerId) {
 const p = r.players.get(viewerId);
 return {code:r.code,phase:r.phase,round:r.round,totalRounds:TOTAL_ROUNDS,secondsLeft:r.secondsLeft,market:Object.values(r.market),news:r.news,players:[...r.players.values()].map(x=>publicPlayer(x,r)).sort((a,b)=>b.portfolioValue-a.portfolioValue),isHost:viewerId===r.hostId,you:p?{cash:money(p.cash),holdings:p.holdings,pendingOrders:p.orders,transactions:p.transactions,portfolioValue:money(portfolioValue(p,r))}:null,minPlayers:MIN_PLAYERS,maxPlayers:MAX_PLAYERS};
}
function emitRoom(r) { for (const p of r.players.values()) if (p.online) io.to(p.id).emit('state',snapshot(r,p.id)); }
function emitError(socket,message){socket.emit('appError',{message});}
function addNews(r,title,body){r.news.unshift({title,body,at:Date.now()});r.news=r.news.slice(0,6);}
function createRoom(socket,name){
 let code; do { code=makeCode(); } while(rooms.has(code));
 const player={id:socket.id,name,cash:START_CASH,holdings:{},orders:[],transactions:[],online:true};
 const r={code,hostId:socket.id,phase:'lobby',round:1,secondsLeft:ROUND_SECONDS,market:makeMarket(),news:[],players:new Map([[socket.id,player]]),timer:null};
 addNews(r,'MARKET OPEN','The simulated trading arena is ready.');
 rooms.set(code,r);socket.join(code);socket.emit('roomCreated',{code});emitRoom(r);
}
function joinRoom(socket,code,name){
 const r=rooms.get(code);
 if(!r)return emitError(socket,'Room not found. Check the 6-character code.');
 if(r.phase!=='lobby')return emitError(socket,'This game has already started.');
 if(r.players.size>=MAX_PLAYERS)return emitError(socket,'This room is full (maximum 8 players).');
 if([...r.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase()))return emitError(socket,'That player name is already in this room. Choose another name.');
 const p={id:socket.id,name,cash:START_CASH,holdings:{},orders:[],transactions:[],online:true};r.players.set(socket.id,p);socket.join(code);socket.emit('roomJoined',{code});emitRoom(r);
}
function startGame(r,socket){
 if(socket.id!==r.hostId)return emitError(socket,'Only the room host can start the game.');
 if(r.phase!=='lobby')return emitError(socket,'The game has already started.');
 if(r.players.size<MIN_PLAYERS)return emitError(socket,'At least 2 players are required to start.');
 r.phase='active';r.round=1;r.secondsLeft=ROUND_SECONDS;addNews(r,'ROUND 1 LIVE','Trading is open. Orders settle together at the end of the round.');
 r.timer=setInterval(()=>{if(r.phase!=='active')return;r.secondsLeft--;if(r.secondsLeft<=0)settleRound(r);else emitRoom(r);},1000);
 emitRoom(r);
}
function queueOrder(r,p,side,symbol,quantity,socket){
 if(r.phase!=='active')return emitError(socket,'Orders can only be placed during an active round.');
 const stock=r.market[symbol];const q=Math.floor(Number(quantity));
 if(!stock||!Number.isSafeInteger(q)||q<1||q>100000)return emitError(socket,'Choose a valid stock and quantity.');
 if(side!=='BUY'&&side!=='SELL')return emitError(socket,'Invalid order side.');
 if(side==='SELL'){
  const already=p.orders.filter(o=>o.side==='SELL'&&o.symbol===symbol).reduce((a,o)=>a+o.quantity,0);
  if((p.holdings[symbol]||0)-already<q)return emitError(socket,'Not enough available shares for this sell order.');
 }
 p.orders.push({id:makeId(),side,symbol,quantity:q,round:r.round,createdAt:Date.now()});
 p.transactions.unshift({text:`${side} ${q} ${symbol} queued`,time:Date.now(),status:'PENDING'});p.transactions=p.transactions.slice(0,30);emitRoom(r);
}
function settleRound(r){
 if(r.phase!=='active')return;
 // One common closing price is generated before any player's orders are processed.
 for(const s of Object.values(r.market)){
  s.previous=s.price;const shock=(Math.random()-0.485)*0.032;s.price=Math.max(1,Number((s.price*(1+shock)).toFixed(2)));s.change=(s.price/s.previous-1)*100;s.volume=Math.floor(100000+Math.random()*1400000);s.history.push(s.price);if(s.history.length>45)s.history.shift();
 }
 let executed=0;
 for(const p of r.players.values()){
  for(const o of p.orders){const price=r.market[o.symbol].price,value=price*o.quantity;
   if(o.side==='BUY'&&value<=p.cash){p.cash-=value;p.holdings[o.symbol]=(p.holdings[o.symbol]||0)+o.quantity;p.transactions.unshift({text:`BUY ${o.quantity} ${o.symbol} @ ₹${money(price).toLocaleString('en-IN')}`,time:Date.now(),status:'FILLED'});executed++;}
   else if(o.side==='SELL'&&(p.holdings[o.symbol]||0)>=o.quantity){p.cash+=value;p.holdings[o.symbol]-=o.quantity;if(!p.holdings[o.symbol])delete p.holdings[o.symbol];p.transactions.unshift({text:`SELL ${o.quantity} ${o.symbol} @ ₹${money(price).toLocaleString('en-IN')}`,time:Date.now(),status:'FILLED'});executed++;}
   else p.transactions.unshift({text:`${o.side} ${o.quantity} ${o.symbol} rejected · insufficient ${o.side==='BUY'?'cash':'shares'}`,time:Date.now(),status:'REJECTED'});
  }
  p.orders=[];p.transactions=p.transactions.slice(0,30);
 }
 const events=[['BULLISH MOMENTUM','Risk appetite improves across selected sectors.'],['GLOBAL CUES','Mixed global signals increase market volatility.'],['SECTOR ROTATION','Flows rotate between banking, IT and industrials.'],['INFLATION WATCH','Traders reassess rate expectations after simulated data.'],['RISK-OFF ALERT','A simulated global shock pressures cyclical shares.'],['EARNINGS BEAT','Positive earnings surprise lifts selected counters.']];
 const event=events[Math.floor(Math.random()*events.length)];addNews(r,event[0],event[1]);
 if(r.round>=TOTAL_ROUNDS){r.phase='finished';r.secondsLeft=0;if(r.timer)clearInterval(r.timer);r.timer=null;addNews(r,'GAME COMPLETE','Final portfolios have been calculated.');}
 else {r.round++;r.secondsLeft=ROUND_SECONDS;}
 emitRoom(r);
}
function cleanName(v){return String(v||'').trim().replace(/[<>]/g,'').slice(0,18);}
io.on('connection',socket=>{
 socket.on('createRoom',({name}={})=>{const n=cleanName(name);if(!n)return emitError(socket,'Enter your player name first.');createRoom(socket,n);});
 socket.on('joinRoom',({code,name}={})=>{const n=cleanName(name),c=String(code||'').trim().toUpperCase();if(!n)return emitError(socket,'Enter your player name first.');if(!/^[A-Z0-9]{6}$/.test(c))return emitError(socket,'Enter a valid 6-character room code.');joinRoom(socket,c,n);});
 socket.on('startGame',()=>{const r=[...rooms.values()].find(x=>x.players.has(socket.id));if(!r)return emitError(socket,'Join a room first.');startGame(r,socket);});
 socket.on('placeOrder',({side,symbol,quantity}={})=>{const r=[...rooms.values()].find(x=>x.players.has(socket.id));if(!r)return emitError(socket,'Join a room first.');queueOrder(r,r.players.get(socket.id),String(side||'').toUpperCase(),String(symbol||''),quantity,socket);});
 socket.on('endRound',()=>{const r=[...rooms.values()].find(x=>x.players.has(socket.id));if(!r)return emitError(socket,'Join a room first.');if(socket.id!==r.hostId)return emitError(socket,'Only the host can close the round early.');settleRound(r);});
 socket.on('disconnect',()=>{for(const r of rooms.values()){const p=r.players.get(socket.id);if(p){p.online=false;emitRoom(r);if(r.phase==='lobby'&&socket.id===r.hostId){const next=[...r.players.values()].find(x=>x.online);if(next)r.hostId=next.id;}break;}}});
});
const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`MARKET WARS running on port ${PORT}`));
