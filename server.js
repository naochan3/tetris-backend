const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// アプリケーション初期化
const app = express();
const server = http.createServer(app);

// ステータス確認用のエンドポイント
app.get('/', (req, res) => {
  res.send({
    status: 'ok',
    message: 'Tetris Game Socket Server Running',
    time: new Date().toISOString(),
    activeUsers: activeUsers.size,
    activeRooms: activeRooms.size
  });
});

// グローバル変数
const activeUsers = new Map();
const activeRooms = new Map();

// Socket.IO サーバーの設定
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  connectTimeout: 30000,
  pingTimeout: 20000,
  pingInterval: 15000,
});

// Socket.IO接続処理
io.on('connection', (socket) => {
  console.log('新しいクライアント接続:', socket.id);
  
  // クライアントに接続確立を通知
  socket.emit('connection:established', {
    socketId: socket.id,
    serverTime: Date.now(),
    message: 'Socket.IOサーバーに接続しました'
  });
  
  // ユーザー認証・ログイン
  socket.on('user:login', (userData) => {
    try {
      const { userId, username } = userData;
      if (!userId || !username) {
        socket.emit('error', { message: 'ユーザーID、ユーザー名が不足しています' });
        return;
      }
      
      // ユーザー情報を保存
      const user = {
        id: userId,
        username,
        socketId: socket.id,
        status: 'online',
        lastActive: Date.now()
      };
      
      activeUsers.set(userId, user);
      socket.userId = userId;
      
      // アクティブユーザーリストを更新して送信
      io.emit('users:update', Array.from(activeUsers.values()));
      io.emit('rooms:update', Array.from(activeRooms.values()));
      
      console.log(`ユーザーがログインしました: ${username} (${userId})`);
      
      // ログイン成功を通知
      socket.emit('user:login_success', {
        user,
        onlineUsers: Array.from(activeUsers.values()),
        activeRooms: Array.from(activeRooms.values())
      });
    } catch (error) {
      console.error('ユーザーログインエラー:', error);
      socket.emit('error', { message: 'ログイン処理でエラーが発生しました' });
    }
  });
  
  // ユーザーログアウト
  socket.on('user:logout', () => {
    try {
      if (socket.userId) {
        activeUsers.delete(socket.userId);
        
        // ユーザーが部屋に参加している場合は退出処理
        for (const [roomId, room] of activeRooms.entries()) {
          if (room.players.some(p => p.id === socket.userId)) {
            // プレイヤーを部屋から削除
            room.players = room.players.filter(p => p.id !== socket.userId);
            
            // 部屋が空になったら削除
            if (room.players.length === 0) {
              activeRooms.delete(roomId);
            } else {
              // 部屋のホストが退出した場合は新しいホストを設定
              if (room.hostId === socket.userId && room.players.length > 0) {
                room.hostId = room.players[0].id;
              }
              
              // 部屋の状態を更新
              activeRooms.set(roomId, room);
              
              // 部屋の更新を通知
              io.to(roomId).emit('room:update', room);
            }
          }
        }
        
        // アクティブユーザーリストを更新して送信
        io.emit('users:update', Array.from(activeUsers.values()));
        io.emit('rooms:update', Array.from(activeRooms.values()));
        
        console.log(`ユーザーがログアウトしました: ${socket.userId}`);
        delete socket.userId;
      }
    } catch (error) {
      console.error('ユーザーログアウトエラー:', error);
    }
  });
  
  // 部屋の作成
  socket.on('room:create', (roomData) => {
    try {
      const { name, hostId, maxPlayers } = roomData;
      const host = activeUsers.get(hostId);
      
      if (!host) {
        socket.emit('error', { message: 'ホストユーザーが見つかりません' });
        return;
      }
      
      // 部屋IDを生成
      const roomId = `room_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      // 部屋の情報を作成
      const room = {
        id: roomId,
        name,
        hostId,
        players: [{ ...host, isReady: false }],
        status: 'waiting',
        maxPlayers: maxPlayers || 2,
        createdAt: Date.now(),
        lastActive: Date.now()
      };
      
      // 部屋をアクティブリストに追加
      activeRooms.set(roomId, room);
      
      // ソケットを部屋に参加させる
      socket.join(roomId);
      
      // 部屋の作成を通知
      socket.emit('room:created', room);
      io.emit('rooms:update', Array.from(activeRooms.values()));
      
      console.log(`部屋が作成されました: ${name} (${roomId})`);
    } catch (error) {
      console.error('部屋作成エラー:', error);
      socket.emit('error', { message: '部屋の作成中にエラーが発生しました' });
    }
  });
  
  // 部屋への参加
  socket.on('room:join', (data) => {
    try {
      const { roomId, userId } = data;
      const user = activeUsers.get(userId);
      const room = activeRooms.get(roomId);
      
      if (!user) {
        socket.emit('error', { message: 'ユーザーが見つかりません' });
        return;
      }
      
      if (!room) {
        socket.emit('error', { message: '部屋が見つかりません' });
        return;
      }
      
      if (room.players.length >= room.maxPlayers) {
        socket.emit('error', { message: '部屋が満員です' });
        return;
      }
      
      if (room.status === 'playing') {
        socket.emit('error', { message: '部屋はすでにゲーム中です' });
        return;
      }
      
      // すでに参加している場合は何もしない
      if (room.players.some(p => p.id === userId)) {
        socket.join(roomId);
        socket.emit('room:joined', room);
        return;
      }
      
      // ユーザーを部屋のプレイヤーリストに追加
      room.players.push({ ...user, isReady: false });
      room.lastActive = Date.now();
      
      // ソケットを部屋に参加させる
      socket.join(roomId);
      
      // 部屋の情報を更新
      activeRooms.set(roomId, room);
      
      // 部屋の参加を通知
      socket.emit('room:joined', room);
      io.to(roomId).emit('room:update', room);
      io.emit('rooms:update', Array.from(activeRooms.values()));
      
      console.log(`ユーザーが部屋に参加しました: ${user.username} -> ${room.name}`);
    } catch (error) {
      console.error('部屋参加エラー:', error);
      socket.emit('error', { message: '部屋への参加中にエラーが発生しました' });
    }
  });
  
  // 部屋からの退出
  socket.on('room:leave', (data) => {
    try {
      const { roomId, userId } = data;
      const room = activeRooms.get(roomId);
      
      if (!room) {
        socket.emit('error', { message: '部屋が見つかりません' });
        return;
      }
      
      // プレイヤーを部屋から削除
      room.players = room.players.filter(p => p.id !== userId);
      
      // 部屋が空になったら削除
      if (room.players.length === 0) {
        activeRooms.delete(roomId);
        io.emit('rooms:update', Array.from(activeRooms.values()));
        console.log(`部屋が削除されました: ${room.name} (${roomId})`);
        return;
      }
      
      // ホストが退出した場合は新しいホストを設定
      if (room.hostId === userId) {
        room.hostId = room.players[0].id;
      }
      
      // ソケットを部屋から退出させる
      socket.leave(roomId);
      
      // 部屋の情報を更新
      room.lastActive = Date.now();
      activeRooms.set(roomId, room);
      
      // 部屋の更新を通知
      io.to(roomId).emit('room:update', room);
      io.emit('rooms:update', Array.from(activeRooms.values()));
      socket.emit('room:left', { roomId });
      
      console.log(`ユーザーが部屋から退出しました: ${userId} -> ${room.name}`);
    } catch (error) {
      console.error('部屋退出エラー:', error);
      socket.emit('error', { message: '部屋からの退出中にエラーが発生しました' });
    }
  });
  
  // 切断処理
  socket.on('disconnect', () => {
    try {
      console.log('クライアントが切断しました:', socket.id);
      
      // ユーザーが認証済みの場合はログアウト処理
      if (socket.userId) {
        const userId = socket.userId;
        activeUsers.delete(userId);
        
        // ユーザーが部屋に参加している場合は退出処理
        for (const [roomId, room] of activeRooms.entries()) {
          if (room.players.some(p => p.id === userId)) {
            // プレイヤーを部屋から削除
            room.players = room.players.filter(p => p.id !== userId);
            
            // 部屋が空になったら削除
            if (room.players.length === 0) {
              activeRooms.delete(roomId);
            } else {
              // ホストが退出した場合は新しいホストを設定
              if (room.hostId === userId) {
                room.hostId = room.players[0].id;
              }
              
              // 部屋の状態を更新
              activeRooms.set(roomId, room);
              
              // 部屋の更新を通知
              io.to(roomId).emit('room:update', room);
            }
          }
        }
        
        // アクティブユーザーリストを更新して送信
        io.emit('users:update', Array.from(activeUsers.values()));
        io.emit('rooms:update', Array.from(activeRooms.values()));
      }
    } catch (error) {
      console.error('切断処理エラー:', error);
    }
  });
});

// サーバー起動
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Socket.IOサーバーが起動しました: http://localhost:${PORT}`);
}); 