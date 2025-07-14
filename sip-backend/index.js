const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const AsteriskManager = require("asterisk-manager");
const cors = require("cors");

const app = express();


// active 

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "connect-src 'self' wss://172.16.40.62:8089 checkout.stripe.com https://checkout.stripe.com https://billing.stripe.com/session https://api.funcaptcha.com https://api.arkoselabs.com sentry.io api.github.com www.npmjs.com"
  );
  next();
});


const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
  },
});

app.use(cors());
app.use(express.json());

// Connect to Asterisk AMI
const ami = new AsteriskManager(
  5038,
  "172.16.40.62",
  "admin",
  "Xx9sjrvFqDmcP4GPddre",
  true
);
ami.keepConnected();

// Store connected sockets
let activeSockets = new Map();

io.on("connection", (socket) => {
  console.log("✅ Socket connected:", socket.id);

  // Store user info if needed
  socket.on("registerUser", (userId) => {
    activeSockets.set(userId, socket.id);
    console.log(`👤 Registered user ${userId} to socket ${socket.id}`);
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);
    for (const [userId, sockId] of activeSockets.entries()) {
      if (sockId === socket.id) {
        activeSockets.delete(userId);
        break;
      }
    }
  });
});

// Asterisk event forwarding
ami.on("Newchannel", (event) => {
  if (
    event.ChannelStateDesc === "Ringing" &&
    event.CallerIDNum &&
    event.Exten
  ) {
    console.log("📞 Incoming call from", event.CallerIDNum);

    // Broadcast to all sockets or target user based on DID, etc.
    io.emit("incoming_call", {
      from: event.CallerIDNum,
      to: event.Exten,
    });
  }
});

ami.on("BridgeEnter", (event) => {
  io.emit("call_answered", {
    channel: event.Channel,
    uniqueid: event.Uniqueid,
  });
});

ami.on("Hangup", (event) => {
  io.emit("call_ended", {
    caller: event.CallerIDNum,
    cause: event.Cause,
    causeTxt: event.CauseTxt,
  });
});

server.listen(5000, () => {
  console.log("🚀 Server listening on http://localhost:5000");
});
