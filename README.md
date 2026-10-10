# すくすくガーデン 〜ふーさんたちの 小さい順ならべ〜

数の札（1〜20）を 4×4 の庭に「右へ・下へ 大きくなる」ように植えていき、いちばん先に16マスうめた人が勝ち。
スマホ（iPhone）で遊べる、ブラウザだけのゲームです。ひとり用（CPU）と、ルームコード／招待URL／QRコードで友だちとオンライン対戦（2〜5人、空いた席はCPU）。

- 元にしたゲーム：ミヒャエル・シャハト『ラッキーナンバー』（ファンメイドの非公式作品。くわしくは [RULES_NOTES.md](RULES_NOTES.md)）
- CPU：ふーさん🐻・ミミ🐰・ロボミ🤖・ニャコ😺・ポチ太🐶・コンタ🦊 × 弱い／普通／強い／アストラウルトラ😎
- バリアント：シャハト式の初期配置、トーナメント、ブルーノ・カタラ式（ななめに同じ数で もう1回）

## 遊び方（開発）
```
python3 -m http.server 8941   # → http://localhost:8941/
```
`?from=portal` を付けると「🏠 ひろばへ」ボタンが出ます。`?turbo` は演出を早送り（テスト用）。

## 仕組み
- `logic.js` … ルールと CPU（ブラウザでも Node でも動く）。ホストだけが山の順番を持ち、`viewFor` で各自に見せてよい情報だけを作る
- `host.js` / `net.js` … PeerJS（STUN のみ）で P2P。ホストが正、参加者は操作を送るだけ。ニックネームで入り直せる
- `ui.js` / `app.js` / `core.js` / `index.html` … 画面。札をタップ → 光ったマスをタップで置く
- `weights.js` … 自己対戦（`tools/train.js`）で調整した「強い」の重み

## テスト
```
node test/logic.test.js          # ルール・情報漏れ・CPU のズルなし（80項目）
node test/sim.js                 # CPU どうしの勝率（test/sim-report.json）
node test/stun.js <box-ip> 3478 & node test/e2e.js <box-ip> 8941   # ブラウザ E2E（screenshots/ に画像）
```

ふらっとgames ／ 制作 watg
