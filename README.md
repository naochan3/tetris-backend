# Tetris Game - バックエンドサーバー

このリポジトリは、Tetrisゲームのバックエンドサーバーです。Socket.IOを使用したリアルタイム通信を提供します。

## 機能

- Socket.IOを使用したリアルタイム通信
- ユーザー認証
- ルーム管理
- マルチプレイヤー対戦

## 技術スタック

- Node.js
- Express
- Socket.IO

## 開発環境のセットアップ

```bash
# パッケージのインストール
npm install

# 開発サーバーの起動
npm run dev
```

## 環境変数

`.env`ファイルに以下の環境変数を設定してください：

- `PORT`: サーバーのポート番号（デフォルト: 8080）
- `FRONTEND_URL`: フロントエンドのURL（CORS設定用）

## デプロイ

このサーバーはRailwayにデプロイされることを想定しています。

### Railway へのデプロイ手順

1. Railwayアカウントを作成
2. 新しいプロジェクトを作成
3. GitHubリポジトリからデプロイを選択
4. 環境変数を設定
   - `PORT`: 自動設定（Railway側で管理）
   - `FRONTEND_URL`: VercelでデプロイしたフロントエンドのURL 