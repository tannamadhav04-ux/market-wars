const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, "public")));

const START_CASH = 1_000_000, MAX_PLAYERS = 8, MIN_PLAYERS = 2;
const ROUND_SECONDS = 180, TOTAL_ROUNDS = 10;
const seed = [
  ["RELIANCE",1450],["HDFCBANK",1720],["ICICIBANK",1280],["TCS",3450],["INFY",1520],
  ["SBIN",825],["ITC",438],["LT",3620],["BHARTIARTL",1580],["AXISBANK",1120],
  ["TATAMOTORS",970],["MARUTI",12400],["SUNPHARMA",1680],["WIPRO",510],["ONGC",285],
  ["NTPC",390],["ADANIPORTS",1420],["HINDUNILVR",2480],["BAJFINANCE",7200],["TATASTEEL",165]
];
const rooms = new Map();
const makeMarket = () => Object.fromEntries(seed.map(([symbol, price]) => [symbol,{symbol,price,previous:price,changePct:0,history:[price],volume:0}]));
const roomCode = () => crypto.randomBytes(4).toString("hex").slice(0,6).toUpperCase();
const publicPlayer = p => ({id:p.id,name:p.name,connected:p.connected,portfolioValue:portfolio(p)});
function portfolio(p) { return p.cash + Object.entries(p.holdings).reduce((sum,[s,q])=>sum+q*rooms.get(p.room).market[s].price,0); }
function roomSnapshot(r, viewerId) {
  const viewer = r.players.get(viewerId);
  return {
    code:r.code,isHost:viewerId===r.hostId,phase:r.phase,round:r.round,secondsLeft:r.secondsLeft,market:r.market,
    news:r.news,players:[...r.players.values()].map(publicPlayer).sort((a,b)=>b.portfolioValue-a.portfolioValue),
    you:viewer ? {cash:viewer.cash,holdings:viewer.holdings,pendingOrders:viewer.orders,transactions:viewer.transactions,portfolioValue:portfolio(viewer)} : null,
    minPlayers:MIN_PLAYERS,maxPlayers:MAX_PLAYERS,totalRounds:TOTAL_ROUNDS
  };
}
function emitRoom(r) {
  for (const p of r.players.values()) io.to(p.id).emit("state",roomSnapshot(r,p.id));
}
function makeRoom(hostId,name) {
  let code; do { code=roomCode(); } while(rooms.has(code));
  const r={code,hostId,phase:"lobby",round:0,secondsLeft:ROUND_SECONDS,market:makeMarket(),news:[{title:"WELCOME TO MARKET WARS",body:"The market is simulated. Trade with virtual cash only.",at:Date.now()}],players:new Map(),timer:null};
  rooms.set(code,r); addPlayer(r,hostId,name); return r;
}
function addPlayer(r,id,name) {
  const p={id,name:String(name||"Trader").trim().slice(0,18)||"Trader",room:r.code,cash:START_CASH,holdings:{},orders:[],transactions:[],connected:true};
  r.players.set(id,p); return p;
}
function marketTick(r) {
  for(const s of Object.values(r.market)) {
    s.previous=s.price;
    const shock=(Math.random()-.49)*.018;
    s.price=Math.max(1,Math.round(s.price*(1+shock)*100)/100);
    s.changePct=(s.price/s.previous-1)*100;
    s.volume=Math.floor(50000+Math.random()*950000);
    s.history.push(s.price); if(s.history.length>60)s.history.shift();
  }
  const events=[
    ["BANKING MOMENTUM","Simulated buying interest lifts banking shares."],
    ["GLOBAL CUES","Mixed overseas signals increase market volatility."],
    ["IT SECTOR WATCH","Technology shares react to a simulated demand update."],
    ["INFLATION DATA","Traders reassess rate expectations after new data."],
    ["RISK-OFF ALERT","A simulated global shock weighs on cyclical shares."]
  ];
  const e=events[Math.floor(Math.random()*events.length)];
  r.news.unshift({title:e[0],body:e[1],at:Date.now()}); r.news=r.news.slice(0,8);
}
function settle(r) {
  for(const p of r.players.values()) {
    const outcomes=[];
    for(const o of p.orders) {
      const price=r.market[o.symbol].price, amount=price*o.quantity;
      if(o.side==="BUY" && amount<=p.cash) {
        p.cash=Math.round((p.cash-amount)*100)/100;
        p.holdings[o.symbol]=(p.holdings[o.symbol]||0)+o.quantity;
        outcomes.push({id:o.id,side:o.side,symbol:o.symbol,quantity:o.quantity,price,status:"EXECUTED"});
      } else if(o.side==="SELL" && (p.holdings[o.symbol]||0)>=o.quantity) {
        p.cash=Math.round((p.cash+amount)*100)/100;
        p.holdings[o.symbol]-=o.quantity;
        if(!p.holdings[o.symbol]) delete p.holdings[o.symbol];
        outcomes.push({id:o.id,side:o.side,symbol:o.symbol,quantity:o.quantity,price,status:"EXECUTED"});
      } else outcomes.push({id:o.id,side:o.side,symbol:o.symbol,quantity:o.quantity,status:"REJECTED",reason:"Insufficient cash or shares at settlement"});
    }
    p.transactions=[...outcomes,...p.transactions].slice(0,60); p.orders=[];
  }
  r.phase="results"; r.secondsLeft=0; emitRoom(r);
  if(r.round>=TOTAL_ROUNDS) return;
  setTimeout(()=>{ if(!rooms.has(r.code)||r.phase!=="results")return; r.round++; r.phase="trading"; r.secondsLeft=ROUND_SECONDS; marketTick(r); emitRoom(r); },5000);
}
function tick(r) {
  if(r.phase!=="trading")return;
  r.secondsLeft--;
  if(r.secondsLeft<=0) settle(r);
  else emitRoom(r);
}
io.on("connection",socket=>{
  socket.on("createRoom",({name},cb={})=>{
    const r=makeRoom(socket.id,name); socket.join(r.code); cb({ok:true,code:r.code}); emitRoom(r);
  });
  socket.on("joinRoom",({code,name},cb={})=>{
    const r=rooms.get(String(code||"").toUpperCase());
    if(!r)return cb({ok:false,error:"Room not found"});
    if(r.phase!=="lobby")return cb({ok:false,error:"This room has already started"});
    if(r.players.size>=MAX_PLAYERS)return cb({ok:false,error:"Room is full"});
    addPlayer(r,socket.id,name); socket.join(r.code); cb({ok:true,code:r.code}); emitRoom(r);
  });
  socket.on("startGame",(_,cb={})=>{
    const r=[...rooms.values()].find(x=>x.players.has(socket.id));
    if(!r)return cb({ok:false,error:"Room not found"});
    if(r.hostId!==socket.id)return cb({ok:false,error:"Only the host can start the game"});
    if(r.players.size<MIN_PLAYERS)return cb({ok:false,error:"At least 2 players are required"});
    if(r.phase!=="lobby")return cb({ok:false,error:"Game already started"});
    r.phase="trading";r.round=1;r.secondsLeft=ROUND_SECONDS;
    r.timer=setInterval(()=>tick(r),1000); emitRoom(r); cb({ok:true});
  });
  socket.on("placeOrder",({side,symbol,quantity,orderId},cb={})=>{
    const r=[...rooms.values()].find(x=>x.players.has(socket.id));
    if(!r)return cb({ok:false,error:"Not in a room"});
    const p=r.players.get(socket.id);
    if(r.phase!=="trading")return cb({ok:false,error:"Trading is closed"});
    if(!["BUY","SELL"].includes(side)||!r.market[symbol])return cb({ok:false,error:"Invalid order"});
    quantity=Number(quantity);
    if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100000)return cb({ok:false,error:"Invalid quantity"});
    if(!orderId||p.orders.some(o=>o.id===orderId)||p.transactions.some(o=>o.id===orderId))return cb({ok:false,error:"Duplicate order"});
    if(side==="SELL") {
      const already=p.orders.filter(o=>o.side==="SELL"&&o.symbol===symbol).reduce((a,o)=>a+o.quantity,0);
      if((p.holdings[symbol]||0)-already<quantity)return cb({ok:false,error:"Not enough unreserved shares"});
    } else {
      const reserved=p.orders.filter(o=>o.side==="BUY").reduce((a,o)=>a+r.market[o.symbol].price*o.quantity,0);
      if(p.cash-reserved<r.market[symbol].price*quantity)return cb({ok:false,error:"Not enough available cash"});
    }
    p.orders.push({id:orderId,side,symbol,quantity,submittedAt:Date.now()});
    cb({ok:true}); emitRoom(r);
  });
  socket.on("cancelOrder",({orderId},cb={})=>{
    const r=[...rooms.values()].find(x=>x.players.has(socket.id)); if(!r)return cb({ok:false});
    const p=r.players.get(socket.id); const before=p.orders.length;
    p.orders=p.orders.filter(o=>o.id!==orderId); cb({ok:p.orders.length<before}); emitRoom(r);
  });
  socket.on("disconnect",()=>{
    for(const r of rooms.values()) if(r.players.has(socket.id)){r.players.get(socket.id).connected=false;emitRoom(r);}
  });
});
server.listen(process.env.PORT||3000,()=>console.log("MARKET WARS running on port "+(process.env.PORT||3000)));
