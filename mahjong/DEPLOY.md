# ネットに公開して、iPhoneだけで遊ぶ(部屋コード方式)

PCを起動しなくても、全員が同じURLを開き、4文字の「部屋コード」で入れます。
無料の Render を使う手順です(クレジットカード不要・約10分)。

## 1. GitHub にファイルを置く(コマンド不要)
1. https://github.com でアカウントを作り、右上「＋」→ **New repository**。名前は `mahjong`(Public でOK)。
2. 作成後の画面で **uploading an existing file** をクリック。
3. このフォルダの中身(`server.js` `package.json` `render.yaml` `build.js` `src` `dist` `test` など)を**フォルダごとドラッグ**。`dist` フォルダ(中に mahjong.html)が入っていることが大事です。
4. 下の **Commit changes** を押す。

## 2. Render で公開する
1. https://render.com に GitHub でログイン。
2. **New +** → **Web Service** → さきほどの `mahjong` を選ぶ。
3. 設定: Runtime = **Node** / Build Command = 空欄 / Start Command = `node server.js` / Instance Type = **Free**。
4. **Create Web Service**。数分後に `https://mahjong-xxxx.onrender.com` のようなURLができます。

## 3. 遊ぶ
1. 全員そのURLをSafariで開く → 共有ボタン →「ホーム画面に追加」(次からアイコンで開けます)。
2. 1人が「部屋を作る」→ 4文字のコードと招待リンクが出る →「招待を送る」でLINEなどに送る。
3. 友達はリンクを開くだけ、またはコードを入力して参加。ホストが「対局開始」。

## 知っておくこと
- 無料プランは、しばらく誰も使わないと止まります。最初のアクセスに30秒〜1分かかることがあります(2回目以降は速いです)。
- 電波が切れたり、アプリを切り替えたりすると、戻るまで(5分以内)AIが代わりに打ちます(💤表示)。
- 部屋コードを知っている人は誰でも入れます。知らない人に送らないでください。
- 更新するときは、GitHub で `dist/mahjong.html` などを上書きアップロードすれば、Render が自動で入れ替えます。
