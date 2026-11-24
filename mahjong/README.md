# 麻雀 / Mahjong (Japanese Riichi)

## 1. ひとりで遊ぶ / Solo
`dist/mahjong.html` をブラウザで開くだけ。 Just open `dist/mahjong.html` in a browser.

## 2. PCがホスト / PC as host (LAN)
Node.js (v18+) が必要 / requires Node.js.

    node server.js          # or double-click start.bat (Windows) / start.command (Mac)

表示された `Same Wi-Fi` のアドレスを、PCのブラウザと友達のスマホ・PCで開く。
Open the printed "Same Wi-Fi" address on the PC and on friends' phones/PCs. Press "Host a room" on one device, "Join a room" on the others.

## 2b. ネットに公開(部屋コード方式)
PCなしで、iPhoneだけで遊べます。手順は `DEPLOY.md` を見てください。

## 3. スマホ/ブラウザがホスト / Phone or browser as host (no server)
`mahjong.html` を開き「部屋を作る」→「友達を追加」。表示された接続コードを友達に送り、友達が作った返信コードを貼り付けて「接続」。
Open `mahjong.html`, "Host a room" → "Add a friend". Send the code to your friend, paste their reply code, press Connect.
ホストの画面は開いたままに / The host must keep the page open.

## Rebuild
    node build.js           # src/* -> dist/mahjong.html
    node test/score.test.js && node test/sim.test.js && node test/room.test.js && node test/server.test.js
