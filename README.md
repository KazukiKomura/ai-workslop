# 文書の引継ぎと確認作業 — 参加者実験

紹介サイトを置き換えた、回答・編集過程・操作イベントをCloudflare D1へ保存する実験システム。

- 参加者入口: https://handoff-research.research-public.workers.dev/
- 管理画面: https://handoff-research.research-public.workers.dev/admin
- 管理キー: `.private/admin-key.txt`（公開ファイル・Git管理から除外）
- 計画とログ定義: [PROTOCOL_AND_LOGS.md](PROTOCOL_AND_LOGS.md)

## 実施手順

> 以下は旧版の操作記録を含みます。現行 `recipient-20260921-v7.2` は上記の公開入口1つで参加可能で、本番／テストの選択・個別リンク発行・募集枠の作成は不要です。人数は募集サイト側で管理し、参加開始日時で分析対象を抽出します。現行の手順と指標は [方法HTML](reviews/recruitment-20260921/methods-measures.html)、保存形式は [rawデータ一覧](reviews/recruitment-20260921/rawdata-viewer.html) にまとめました。下記のU1/U2、詳細キー・ポインタログ等は現行仕様ではありません。

1. 管理画面に管理キーでログイン。
2. 同意説明に研究実施者・問い合わせ先・報酬・保存期間を設定。
3. 「本番用」で必要人数分の個別参加リンクを発行。リンク一覧CSVを保存して配布。同じリンクは一参加だけ。
4. 参加者は同意→役割・依頼・資料→事前の質問→理解確認（全問正答まで繰り返し）→初読→編集前の認知（十分性・完成度・信頼）→編集・提出→負荷（単項目＋NASA-TLX無加重版）→事後信頼→責任帰属→補完判断→根拠説明U1/U2→六観点の知覚→開示記憶→事後説明へ進む。
   クラウドソーシング（Yahoo!等）で募集する場合は、管理画面の「募集用の共有リンク」を発行して掲載する。参加者ごとにセッションが作られ、終了画面にキーワードと固有の終了コードが表示される。承認はsessionsのcompletion_codeと突き合わせる。
5. 管理画面で進行状況を確認し、CSV・NDJSONを書き出す。

自己確認には「テスト用」リンクを発行。test/liveは混同せず、書き出したデータをmodeで区別する。テスト済みのリンクは再利用せず新しく発行する。

## 記録

ブラウザの各input/beforeinput/keydown/keyup/IMEイベントと編集差分・選択範囲、全文チェックポイント、資料開閉・スクロール・ポインタ、画面表示状態、各回答変更、サーバー確定時刻、条件と刺激版。最後の提出文と確定回答は別テーブルにも保存。

IndexedDBに未送信イベントを一時保存し、ACK後に削除。再送は重複排除。古い編集保存による上書きを防ぎ、再読み込みで再開する。別タブの同時参加を防ぎ、提出後は内容を固定する。

## ローカル検証

```sh
npm install
npx wrangler d1 execute handoff-experiment --local --file schema.sql
node tools/migrate.mjs local
npx wrangler dev --port 8791
node --test tests/api.test.mjs
node tests/browser.mjs
```

`.dev.vars`に検証用ADMIN_KEYを置く。テストコードは既定 `local-test-admin-key` を使う。本番キーをコミットしない。

ブラウザテストはローカルのGoogle Chromeを使う。PC・390px幅、編集／無修正、通信切断・再読み込み、同時タブ、同じブラウザでの新リンク、中止、CSVを検証。日本語IMEのcompositionイベントは合成イベントでハンドラを検査しており、実際のOSのIME操作を完全再現したテストではない。

APIテストでは全6セル、割付前終了、二重送信、同時遷移、保存順序、認証、機密アセット404を確認。テスト結果はソフトウェアの検証であり、刺激の妥当性や人間の負担差の実証ではない。

## デプロイ・バックアップ

```sh
node tools/init-db.mjs
node tools/migrate.mjs remote
npx wrangler secret put ADMIN_KEY < .private/admin-key.txt
npx wrangler deploy
node tools/export.mjs
```

初期化はCREATE IF NOT EXISTSで既存記録を削除しない。バックアップは.private/exportsへ出力。大きいログもページごとに逐次書き出す。

公開ディレクトリはpublicだけ。旧紹介サイトはarchive、旧刺激比較はdistに保存されるが配信されない。変更時は受付停止と進行中セッションを確認し、刺激・質問を収集中に差し替えない。

## 配備記録

2026-09-18：紹介サイトから参加者実験へ更新。
Cloudflare version: `a41853c4-00d4-4dbf-922d-95b3090d3876`。
本番の検証もmode=testの招待だけを使う。

大量ログ保存の修正版: `3944393a-8cde-458d-ab6e-8529d00f360e`。公開したソースのSHA-256はrelease-manifest.jsonに保存。

最終配備: `341f8b12-e36f-459e-9b1f-7258e8f03fe3`。画面切替直後の保存待ち中は次の入力を無効にし、連続操作を取りこぼさないよう修正。

公開環境で最終検証済み：API 6項目、PC（編集・通信切断復帰）とスマートフォン（無修正）の完了、同時タブ防止、新しい招待での再開、中止、管理CSVを確認。最新の検証記録はrelease-manifest.jsonとtest-results/browser-verification.json。


2026-09-19：責任帰属・補完判断の9項目を追加したv3を配備。Cloudflare version: `6cf67a17-0ae8-4f8d-a3e7-0ec434bf4f39`。保存先はCloudflare D1。配備前の本番参加0件を確認し、受付を一時停止・復元した。公開環境でAPI 6検証、PC・スマートフォンの完了、回答復元とCSV出力を確認済み。旧v2セッションは元の質問順を維持する。

2026-09-21：新設計 v4（recipient-20260921-v4）を配備。Cloudflare version: `daccaad2-ed9a-4614-b2d8-1604a578de12`。
- 6案件（`src/cases.js`、`tools/build-cases.mjs` で `stimuli-scope-20260920` から生成）を順次均衡配置。内容状態4（baseline / missing_info / off_focus / overreach）× AI開示2を理解確認通過時に無作為割付。現時点で登録済みの版は baseline（旧P）と overreach（旧G）の2つで、いずれも独立照合前の暫定版。missing_info と off_focus は刺激制作後に `cases.js` へ追加する。
- 理解確認は全問正答まで繰り返し（割付前終了なし）。回数は `sessions.attempts`。
- 質問紙は `src/measurement.js` に集約（AIMQ 完全性6項目、Mayer & Davis 信頼4項目、Frazier 信頼傾向4項目、NASA-TLX無加重版、責任帰属9項目、六観点9項目、U1/U2）。
- D1 に `sessions.base_id`、`sessions.version_hash`、`invitations.campaign_hash`、`campaigns` テーブルを追加（`tools/migrate.mjs`）。
- 募集用の共有リンク（`/#entry=...`）と終了キーワードを追加。
- 旧v3の進行中セッションは再開不可（終了画面で案内）。本番の live 参加0件を確認したうえで受付停止→移行→配備→検証→復元を実施。

2026-09-21（同日 2 回目）：刺激 6 案件 × 4 版を登録した v4.1 を配備。Cloudflare version: `bc700820-1d7f-4509-bcfd-0e8ebd9a107b`。
- 土台は `generation-api-20260920/gpt56sol_effort-medium` の NORMAL 原出力（無変更）。3 比較版は `stimuli-v4-20260921/build_versions.py` で制作し、`versions.json` に文字数・変更段落・SHA-256 を記録。
- AI 盲検照合 2 系統（Claude サブエージェント、Codex gpt-5.6-sol）の最終ラウンドで 24 文書すべてが意図した状態と一致（`stimuli-v4-20260921/STIMULI_REVIEW_REPORT.md`）。人による盲検 2 名の照合は未実施のため、本募集前に実施する。
- 割付は 4 内容状態 × 2 開示の 8 セル。本番の live 参加 0 件を確認して受付停止→配備→復元→検証（API 7 件、ブラウザ PC/スマートフォン）。

2026-09-21（同日 3 回目）：1 人 3 案件の v5（recipient-20260921-v5）を配備。Cloudflare version: `08670b88-f8ce-481f-a9dc-f524c7c21910`。
- 設計：内容状態 4 のうち 3 を参加者内で提示（BIB(4,3) の 4 ブロック × 提示順 6）、AI 開示は参加者間（2）。計 48 系列を mode ごとの最少件数優先（同数は無作為）で割付。案件は使用回数が最少の 3 件を重複なく選び、送り手は位置ごとに 佐藤／鈴木／高橋。
- 進行：表紙（概要・参加の自由・負担・収集情報・管理・同意・参加者情報〔性別・年齢〕）→ 導入（役割説明・信頼傾向）→ 案件 i（資料・理解確認〔全問正答まで反復〕→ 開示表示つき読解 → 認知 → 編集 → 事後 → 事後信頼）× 3 → 責任帰属・補完判断（最終案件）→ 理解確認 U1/U2（無作為 1 案件）→ 知覚（案件別）→ 想起（案件別）→ 終了（キーワード 21wra0966 をコピー可能な形で表示）。
- D1：`sessions.plan_json`、`sessions.sequence`、`session_cases`（案件別の初期文・下書き・提出文）を追加。管理 CSV は案件別列（`case_i` … `submitted_text_i`、`{phase}_{i}.{id}`）を出力。
- 本番の live 参加 0 件を確認して受付停止→移行→配備→復元→検証（API 6 件、ブラウザ PC/スマートフォンで 3 案件完走、約 1,180 イベント/セッション）。
- 表紙に研究代表者・所属・連絡先は表示しない（管理画面の項目は募集案内用に保持）。

2026-09-21（同日 4 回目・修正版）：Cloudflare version `b834b81b-a659-4c2f-a116-1fb9a17dcb93`。
- 不具合：Dia ブラウザで「最初の案件へ」が `Failed to fetch` になる。原因は Dia 内蔵のコンテンツブロッカーが `POST /api/events` を遮断（`net::ERR_BLOCKED_BY_CONTENT_BLOCKER`）し、画面遷移前のログ送信が失敗して遷移が中断されていたこと。Chrome では再現しない。
- 対処：記録送信の経路を `/api/records` に変更（旧 `/api/events` も受け付ける）。ログ送信の失敗は画面遷移を妨げない（未送信分は端末に残り再送）。`api()` は通信失敗・5xx を最大 4 回（0.8/1.6/3.2 秒）再試行し、改善しない場合は拡張機能の無効化や別ブラウザを案内する文言を表示。
- 併せて、参加コード欄はリンク経由で判明している場合は表示しない（手入力が必要な場合のみ表示）。デザインの見直し（`app.css` 末尾の v5 visual refresh）。
- 本番の live 参加 0 件を確認して受付停止→配備→復元→検証（API 6 件、ブラウザ PC/スマートフォン 3 案件完走、Dia での導入→案件 1 遷移確認）。
- 本番用の共有リンク（mode=live、定員なし、終了キーワードは設定値 21wra0966）を発行し `.private/live-campaign-2026-09-21.json` に保存。動作確認も本番リンクで行い、日時で区別する。

2026-09-21（同日 5 回目・v5.1）：Cloudflare version `e7a129c2-a068-401b-9b47-1f6432afa0fe`、protocol `recipient-20260921-v5.1`。
- 質問紙：7 件法および 0〜6 の項目から「判断できない」を廃止（元尺度に合わせ、主要指標の欠測を避ける）。想起の「覚えていない」のみ残す。v5 で開始したセッションも継続可能（`V5_VERSIONS`）。v5 の動作確認セッションに残る `unknown` は欠測として扱う。
- 表紙：「推奨環境・免責事項」を追加（パソコンの最新版ブラウザ推奨、コンテンツブロッカーや通信制限で保存・進行ができない場合の対処、環境起因の未完了について研究者は責任を負わない、報酬は募集案内の条件に従う）。同意事項にも 1 項目追加。
- 検証：本番に対して Chrome・WebKit（Safari エンジン）・Firefox で PC/スマートフォン各 3 案件を完走（`tests/browser.mjs` は `BROWSER=chrome|webkit|firefox`）。Dia でも導入→案件 1 の遷移を確認。WebKit はローカル http では `Secure` クッキーを拒否するため、ローカル検証は Chrome/Firefox で行い、WebKit は本番 https で検証する。
- 以後、live の参加が存在する間は `measurement-rollout.mjs pause` が停止するため、配備は募集の合間に行う。

2026-09-21（同日 6 回目・オープン参加）：Cloudflare version `14db36e6-6ed6-458d-9cb7-5f43e89fe5e2`。
- トップ URL（https://handoff-research.research-public.workers.dev/）をそのまま開くと、設定 `defaultCampaign` に登録した募集枠（本番 live）で参加が始まる。参加コードの入力は不要。`#invite=`・`#entry=` のリンクも従来どおり使える。
- 本番の募集枠は定員なし（capacity 0）。こちら側で同時接続数や人数は絞らない。
- 管理画面の「既定の募集枠のトークンハッシュ」で切り替え可能。空欄にするとトップ URL は参加コード入力に戻る。
- 検証：`tests/open-entry.mjs`（既定枠を一時的に試験用に向けて表紙→導入→案件 1 を確認し、元の設定に戻す）を本番で実行。API 7 件、Chrome 通し試験も合格。

2026-09-21（同日 7 回目・障害記録）：Cloudflare version `9a448d66`（平易化・レイアウト変更）→ `aa9bc907`（例外ログ追加）。
- 障害：本番の書き込み API が 500 を返す（`/api/admin/invites`、`/api/admin/config`、参加開始・回答保存も同様）。読み取り（`/api/config`、`/api/admin/status`）は正常。
- 原因：Worker のログに `D1_ERROR: Your account has exceeded D1's free tier daily row write limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC)`。D1 無料枠の 1 日あたり書き込み行数上限（100,000 行）を、本日の本番に対する通し試験（1 セッション約 1,200 イベント × 複数エンジン × 複数回）で超過した。`wrangler d1 info` の rows_written_24h は 121,815。
- 影響：UTC 0 時（JST 9 時）まで本番では参加を開始できない。配備済みのコード自体は正常（ローカルで API 10 件・Chrome 通し・オープン参加を確認済み）。
- 対処方針：Workers Paid（月 5 ドル、D1 書き込み 5,000 万行/月）への切替を推奨。無料枠のままなら 1 日約 80 名分が上限で、試験も本番 DB に対しては行えない。以後、通し試験はローカルで行い、本番では API の読み取り検証と少数の手動確認に留める。
- 併せて、未処理例外を `console.error` で記録するようにした（`wrangler tail` で原因を追える）。
- この時点の未検証項目：`9a448d66` 以降の本番ブラウザ検証（書き込み不可のため実施できず）。

2026-09-21（同日 8 回目・v5.3）：Cloudflare version `2235b32b-a973-47d4-989b-b4d0b35f0520`。Workers Paid に切替済み（D1 書き込み上限の解消）。
- 記録の削減：pointermove・wheel・pointerdown・pointerup・focusin・focusout、編集欄の keydown・keyup・beforeinput・composition 系を廃止。scroll は対象ごとに 0.5 秒に 1 件（最終位置）。heartbeat は 60 秒ごと。残すのは click、answer_change、scroll、source_open/close、phase_render、editor_input（差分）、editor_snapshot、editor_selection、copy/cut/paste、document_selection、visibility、window 系。自動試験 1 セッションのイベントは約 1,180 件 → 約 380 件。
- 文面：依頼・用語・U1/U2 の平易版（`stimuli-v4-20260921/plain_text_v5.json` を `tools/build-cases.mjs` が適用）。役割は 総務部／市役所の市民課・納税課／クリニックの受付／ホテル に変更し、依頼の最初の一文で求める役を上司の言葉で示す。研究用の注記と資料の出典表示を削除。依頼の段階では資料を見せず、報告案受領後の画面で開く。
- 画面：認知・理解確認の画面は質問を左、報告案と資料を右（追従表示）。中止時は終了コードを表示しない。事前質問の分野経験は 3 分野の固定 3 問（bg_dom_1〜3）。
- 検証：本番で API 7 件、Chrome 通し（PC/スマートフォン、各 3 案件）合格。
- 未決：イベント表の索引削減（重複防止 1 本のみに作り直し。既存の試験データを消す）、資料 S1〜S3 を案 B の抜粋版に差し替えるか。

2026-09-21（同日 9 回目・v5.4）：Cloudflare version `85461b49-bef6-4abc-bf47-3e0869a7355c`。
- 持ち出し対策：報告案・依頼・資料の文章は選択不可（`user-select:none`）。編集欄以外でのコピー・切り取りと、編集欄内でも 200 字以上の選択のコピー・切り取りは遮断して `copy_blocked` を記録し、画面に案内を表示。ドラッグでの持ち出しも遮断（`drag_blocked`）。貼り付けは長さだけ `page_paste` に記録（内容は編集差分 `editor_input` に残る）。
- 最初の教示（作業の説明）に、ページの文章を別サイト・生成AI・メモへ持ち出すことの禁止を明記。
- 検証：本番で API 7 件、Chrome 通し（PC/スマートフォン）、`tests/copy-guard.mjs`（報告案・資料のコピー遮断、編集欄の 20 字コピー許可、全文コピー遮断、貼り付け記録）合格。

2026-09-21（同日 10 回目・v5.5）：Cloudflare version `4388c74e-bc7d-4c6b-adc7-a392af7dec6b`。
- 研究者 IP：設定 `resetIps`（カンマ区切り、末尾 `*` で前方一致）に登録した IP からの参加は、共有リンク・トップ URL 経由なら mode=test、ラベル `researcher:` で記録され、本番の割付や件数に入らない。画面上部に「最初から始める」ボタンが出て、いつでも現在の参加を離れて最初からやり直せる（`/api/leave` がクッキーを消し、端末側の下書き等も消す）。個別リンク（`#invite=`）はこの対象外。
- 中止画面：課題についての説明と終了コードを表示しない。共有リンク・トップ URL からの参加者には「最初から参加し直す」ボタンを出し、新しい参加として再開できる。
- 検証：本番で API 8 件、Chrome 通し（PC/スマートフォン）、中止→再開の確認、研究者 IP の判定を確認。`resetIps` は研究者の自宅回線の IPv4 と IPv6 プレフィックスを登録済み（`.private` には保存していない。管理画面の設定欄で確認できる）。

2026-09-21（同日 11 回目・v6）：Cloudflare version `69696aac-e6bf-4d76-abe7-4da5a29bb060`、protocol `recipient-20260921-v6`、cases `cases-20260921-v5.6`。
- 資料は二層（案 B）：要約（従来）＋「原文の抜粋を読む」（折りたたみ、`stimuli-v4-20260921/excerpts/excerpts.json`、300〜610 字）。開閉は `source_open/close`（`S1-excerpt` など）で記録。表紙の所要時間は 60〜90 分に変更。
- 刺激の再照合：抜粋込みの資料と平易版の依頼で 24 版を盲検再照合（`packets/*_r5.md`、`keys/blind_keys.json` の `*_r5`）。Claude 系統 24/24、Codex 系統 24/24 が意図した状態と一致（`results/claude_r5_*.json`、`results/codex_r5_*.log`）。
- 読了確認：認知ブロックの先頭に「いま読んだ報告案は、何についての報告案でしたか」（4 択、正解＋割付外の 3 案件の題名）。回答と正誤（`readcheck`, `readcheck_correct`）を保存し CSV に出力。
- 教示：役割・依頼の冒頭・読解・編集の要点を太字で強調。編集の教示は「上司に伝わりやすい報告書になるように、報告案を確認して仕上げ、提出してください」に変更。
- 画面遷移：知覚（最初の報告案について）と理解確認（U1/U2、無作為に選んだ 1 案件のみ）を各案件の中に移動し、案件ごとに完結させた。終了後は責任帰属・補完判断（最後の案件）→ 想起（3 件を振り返る。AI 開示に関する質問なので最後に置く）→ 終了。
- 検証：本番で API 8 件、Chrome 通し（PC/スマートフォン、各 3 案件）合格。

2026-09-21：試行（50 名）の準備。
- 試行用の共有リンク（mode=live、ラベル `pilot-50 試行（2026-09-21 発行）`、定員なし）を発行し `.private/pilot-campaign-2026-09-21.json` に保存。本募集とは別リンクで、管理 CSV の invitation_label で区別する。試行データは「刺激・教示を変えなければ合算、変えたら除外」を事前に決める。
- 集計：`node tools/pilot-summary.mjs --label pilot-50`（既定 mode=live）。開始・完了・中止、脱落画面、所要時間（全体と画面別の中央値）、理解確認の回数、読了確認の正答率、編集率と文字数変化、コピー遮断・貼り付け・タブ離脱、U1/U2 の文字数、状態別の MC（perc_2／perc_3／perc_5、perc_1、S、信頼前後、努力、編集率）、開示別の想起を出力。`--json out.json` で案件別の行を保存。
- 判定の目安：perc_2 は情報不足で、perc_3 は焦点ずれで、perc_5 は根拠超えで基準より低いこと。読了確認の正答率 90% 以上。完了の中央値 90 分以内。
- 参照：画面遷移と質問一覧 https://claude.ai/code/artifact/b08ec574-369d-4e78-a6a1-7a9c7074d392 、報告案の作り方 https://claude.ai/code/artifact/37ec539c-acda-44db-9491-eda5d8ea460c 、依頼文の見直し https://claude.ai/code/artifact/b2b3f6c7-02ff-4ba9-a067-53d3ff7be2d9

2026-09-21（同日 12 回目・v6.1）：Cloudflare version `884d0ae1-6f22-4e15-a8c6-8c098544df64`。
- 3 案件を完全に同じ構成にした：資料と確認の質問（2 問、全案件同じ）→ 読む → 報告案について（読了確認＋12）→ 確認して直す → 提出までの作業（7）→ 同僚について（4）→ 最初の報告案について（9）→ 受け取った報告案と役割について（9、旧 責任帰属＋補完判断）→ 方針の根拠について（U1 のみ）。
- 役割の確認（報告案を作るのは誰か、提出するのは誰か）は導入画面に移し、全問正解まで反復（`intro_attempt_n`、materials の attempts には含めない）。
- 3 件の後は共通の質問だけ：3 件を通して（自由記述、任意）→ 報告案の作成方法について（説明の想起と AI 使用の推定を 1 回ずつ。AI 開示は 3 件とも同条件のため）→ 終了。終了コードは表示しない（DB には残す）。
- 管理 CSV：`responsibility_i.*`、`understanding_i.u1` を案件別列に、`reflection.resp_free`、`recall.memory`、`recall.belief` を単独列に変更。
- 検証：本番で API 8 件、Chrome 通し（PC/スマートフォン、各 3 案件）、中止→再開を確認。画面遷移と質問一覧の artifact を完全版に更新。

2026-09-21（同日 13 回目・v7）：Cloudflare version `f8f68ecb-d957-422f-8c40-c0efa055e6ec`、protocol `recipient-20260921-v7`。
- 1 人 4 案件（k=4）。全員が 4 つの内容状態を 1 回ずつ経験する完全型の参加者内計画。提示順は Williams 配列（4×4、各状態が各位置に 1 回、隣接する状態の順序対が全 12 通り 1 回ずつ）。
- 割付アルゴリズム（`allocate`）：①系列（開示 2 × Williams 行 4 = 8）を mode 内の最少件数から無作為に選ぶ（開示 1:1 と順序・位置・持ち越しの均衡）。②テーマは 6 のうち使用回数が最少の 4 つ（同数は無作為）。③テーマと位置の対応は 24 通りの順列のうち、開示群内の「テーマ × 状態」件数（重み 10）と「テーマ × 位置」件数の合計が最小のものを選ぶ（同点は無作為）。④土台はテーマ内で最少使用。plan_json に系列・行・状態列・案件列を記録。
- 送り手は 佐藤／鈴木／高橋／田中。終盤の文言は {k} で案件数に追従。表紙の所要時間は 90〜120 分。
- 「報告案の作成方法について」を開示認識の質問紙に拡充：説明の想起、その自信（0〜10）、AI 使用の推定（0〜10）、作業中の意識（0〜10）、確認・修正への影響（0〜6）、自由記述。
- 読了確認の選択肢は 4 つ（正解＋割付外の 2 テーマ＋割付内の他テーマ 1 つ、目録順）。
- 検証：本番で API 8 件、Chrome 通し（PC/スマートフォン、各 4 案件、約 550 イベント）合格。

2026-09-21（同日 14 回目・v7.1）：Cloudflare version `626777d0-f2d2-44b5-97b4-f30146f24043`。導入画面の「説明の確認」（役割の 2 問と反復）を削除。本番で API 8 件、Chrome 通し（4 案件）合格。
# 現在の募集運用（2026-09-21 更新）

- AI開示は参加者ごとに独立な確率0.5で割り付ける。固定25人枠や離脱に応じた補充は行わない。
- 6テーマから異なる4テーマを選び、4文書条件を各1回経験する。
- 参加の運用を一本化。本番／テストの選択と、IPによる自動振り分けは撤去した。
- 募集人数はクラウドソーシング側で管理する。アプリでは開始数・完了数による自動停止を行わない。旧capacity・completion_targetの値も受付判断に使用しない。
- 共有リンクの同時再送でも参加記録は1件になり、再開時は同じ割付を維持する。過去の動作確認記録は参加者別CSVから除く。
- ローカルで60人開始・離脱・50人完了後の継続受付、4案件の完了、Chromeでのコード不要の参加・再開を確認。公開環境では登録や回答をせず、読み取りのみで検証した。
- 配備ID: `a92e3882-c789-446a-b043-b976936c5c0e`。確認記録: `reviews/recruitment-20260921/deployment.json`。
- 統計方針: `reviews/PILOT_ANALYSIS_4X2_20260921.md`。50人×4回答を独立な200人として扱わない。

以下は過去の開発記録を含む。現在の運用は上記を優先する。

2026-09-21（同日 15 回目・v7.2 統合）：Cloudflare version `fdc1cb0e-caaf-4ccb-bbcf-474984b81f71`。U1 廃止、導入の確認削除、最初の報告案の画面に報告案と資料を右側表示、作成方法の質問を開示方式に依存しない文言に変更。相手エージェントの統合（本番／テスト区別と研究者 IP 振り分けの撤去、共有リンクの再送安全化、人数制限の不使用）を取り込み、開示は参加者ごとの公平なコイン投げ（p=0.5）に統一。中止後の「最初から参加し直す」は共有リンク参加で維持。ローカルで Miniflare 5 件・API 11 件・Chrome 4 案件通し、本番で API・Chrome 通しを確認。

2026-09-21：表紙の所要時間を「おおよそ 30〜60 分程度」に変更（研究者の実測に基づく）。Cloudflare version `745976f1-6d48-4715-af27-a17f77d0b96c`。

2026-09-21：自作項目の 0〜10 尺度（effort_total、belief、disc_confidence、disc_attention）を 1〜7 の 7 件法に変更。0〜6 の影響方向項目は 7 段階のまま。NASA-TLX の 0〜100 は既存尺度のため維持。Cloudflare version `22745055-780e-40f9-8b3c-948a1ad9daab`。

2026-09-21：最後のブロックの後に AIAS-4（Grassini 2023、生成AI への一般的態度、4 項目、7 件法）を共変量として追加。CSV は `attitude.aias_1〜4`。Cloudflare version `80f04047-b7f5-4584-aecb-9f7aea55306a`。

2026-09-21：表紙の冒頭に「制限時間は 60 分です。開始から 60 分以内に最後まで終えてください。」を太字で 1 行追加。Cloudflare version `af8905cc-9da7-4f05-ad00-e5710cc84932`。共有リンクは DB 上の募集枠トークンで決まり、配備では変わらない。

## 試行データの集計で除外する記録（2026-09-21）

試行用の募集枠（ラベル `campaign:pilot-50 試行（2026-09-21 発行）`）には、募集開始前に自動実行による開始記録が 51 件ある。人の参加ではないので、集計・分析から除く。データベースからは消していない。

- 特徴：作成時刻 2026-09-21T06:42:52Z〜06:45:52Z（15:42〜15:45 JST）、画面サイズはすべて 1440×1000、50 件が中止（withdrawn）、1 件が約 0.4 分で完了。
- 除外方法（集計スクリプト）：`node tools/pilot-summary.mjs --label pilot-50 --since 2026-09-21T07:00:00Z`。`--since` は募集を開始した時刻（UTC）以降だけを対象にする。実際の募集開始が遅い場合は、その時刻に置き換える。
- 除外方法（CSV 分析）：`participants.csv` の `created_at` が募集開始時刻より前の行を落とす。同じ条件で `sessions.created_at` を使えば events・responses も同様に絞れる。
- 本番／テストの区別は撤去済みのため、以後の動作確認も同じ扱いになる。動作確認をした日時は記録し、同じ方法で除く。

# v8（参加者間・1人1案件）と予備実験環境（2026-09-24、ブランチ v8-between）

設計は `docs/DESIGN-v8.md`、人数は `docs/POWER-v8.md`。刺激と依頼文の入力は `stimuli-v8/`（`node tools/build-cases.mjs` で `src/cases.js` を生成）。条件は `baseline / missing_info / off_focus / source_deviation`。

変更点：1人1案件（開示はコイン投げ、文書条件は開示群内で最少件数優先、テーマは条件×開示で最少件数優先）、知覚ブロック先頭の事実型MC3問（サーバが `fmc_*_correct` を付与）、読了ゲート（`READ_GATE_SECONDS`、既定45秒、クライアントで無効化しサーバでも検証、`read_seconds` を回答に記録）、予告文・監査型注意文、1案件向けの文言。制限時間の表示はアプリから撤去（作業時間の上限は募集サイト側のみ）。

## 配備（本番単一環境。v7.2 と同じ Worker と D1。旧データは protocol_version で区別）

第1波（予備実験）は本実験と同じ環境・同じ募集枠で行い、MCと手続き指標だけで合否を判定する。合格ならそのまま募集を続け、第1波を本実験に含める（`docs/DESIGN-v8.md` 2節）。

```sh
node tools/migrate.mjs remote                 # v8 にスキーマ変更はない（冪等）
npx wrangler deploy
node tools/verify-production.mjs              # 読み取り検証だけ。本番に回答を作らない
node tools/pretest-summary-v8.mjs --since <募集開始UTC>
```

配備前に管理画面の進行状況で進行中セッションがないことを確認する。旧募集枠は閉じ、v8 用の募集枠を新しく発行して共有リンクを掲載する。

ローカル検証は 8795 番で行う（8791 は別セッションが占有することがある）：

```sh
npx wrangler d1 execute handoff-experiment --local --file schema.sql && node tools/migrate.mjs local
npx wrangler dev --port 8795            # .dev.vars に READ_GATE_SECONDS=1 を置くとテストが待たない
TEST_URL=http://localhost:8795 node --test tests/api.test.mjs
node --test tests/measurement.test.mjs tests/campaign-randomization.test.mjs
```

## 2026-09-24：研究者側のMC判定の訂正（配信変更なし）

一次MCでは、各群の正答率の高低ではなく、同じ問の「いいえ」率の変化を片側Fisher検定で確認する。基準群の正答は「はい」、対象操作群の正答は「いいえ」。正答率とWilson区間は群別に報告し、「覚えていない」を除外しない。`tools/factual-mc-v8.mjs` が集計を共通化し、`tools/pretest-summary-v8.mjs` の通常実行ではMCと手続きのみを出力する。MC判定前には `--include-outcomes` を使わない（このフラグはS・編集率・努力の表示／JSON保存を明示的に有効化する）。

設計・根拠は `docs/DESIGN-v8.md` と `docs/POWER-v8.md`。今回、参加者向けソース・正答キー・DBは変更していないためWorkerの再デプロイは不要。合成データによる検証のみで、v8実参加者の条件別主要結果は集計していない。
