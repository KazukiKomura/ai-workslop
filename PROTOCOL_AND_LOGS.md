# 参加者実験・記録仕様

> 2026-09-21更新：以下のv4以前の記載は旧仕様です。現行 `recipient-20260921-v7.2` の手順・指標・ログ粒度は [方法と指標のHTML](reviews/recruitment-20260921/methods-measures.html) を参照してください。4案件／人・4内容条件×開示2群で、U1/U2は実施しません。入力差分は記録しますが、現在はkeydown／pointermove／個別compositionイベントを収集せず、scrollは500ms間隔、heartbeatは60秒間隔です。旧表を現行の収集範囲と解釈しないでください。

## 現行プロトコル recipient-20260921-v4（2026-09-21）

6案件×内容状態4（baseline / missing_info / off_focus / overreach。登録済みは baseline・overreach）×AI開示2。案件は mode 内で順次均衡配置、土台は案件内で均衡、内容状態と開示は理解確認通過時に独立一様割付。理解確認は全問正答まで繰り返し、回数を attempts に記録する（割付前終了なし）。

画面順：入口→同意→役割・依頼・資料→事前の質問（経験3、信頼傾向4）→理解確認4→初読（開示は先頭に表示）→編集前の認知（AIMQ完全性6・完成度2・信頼4）→確認・編集→提出固定→負荷（単項目0–10＋NASA-TLX無加重6）→事後信頼4→責任帰属5→補完判断4＋自由記述→根拠説明U1・条件適用U2→六観点の知覚9（開示文は再表示しない）→開示記憶・AI認識→事後説明・終了コード（募集用リンク経由ではキーワードも表示）。

質問定義の正本は `src/measurement.js`、刺激の正本は `src/cases.js`（生成元 `tools/build-cases.mjs`）。両方のハッシュを versions に保存する。responses の phase は cognition / post / trust_post / responsibility / repair_appraisal / understanding / perception / recall と intro_attempt_n。

## 旧計画（recipient-20260919-v3 まで）

2026-09-18のCASE01 v0.3。公開中の案件は照明事例1件。旧18案件・背景知識操作の設計ではない。本文3条件×開示2条件。独立一様無作為割付（各セル確率1/6）を理解確認通過時に行う。実現人数を厳密に同数にするブロック割付ではない。条件は参加者に返さず、割付済み本文と該当する開示文のみ返す。

現行プロトコル recipient-20260919-v3：入口→同意→役割・依頼→経験／事前信頼／理解確認→初読（参照可、編集不可）→初読負担→確認・編集→提出固定→仕上げ負担／信頼→責任帰属5問→補完判断4問→開示の記憶・推測（本文再表示前）→元の下書きの操作チェック→事後説明・終了コード。

理解確認は一回再回答を認め、二回不通過で割付前に終了。無修正提出は可能。中止・理解確認不通過・進行中は完了と別状態。端末や回線の終了を自動完了扱いにしない。負担は0–10、信頼・操作チェックは1–7＋判断できない。I1/I2/F1/F2の順序は参加者ごとにサーバーで無作為化して保存する。「判断できない」はunknownとして保存し、中点へ変換しない。

## 保存先・認証

Cloudflare Workers + 専用D1 `handoff-experiment`。公開アセットはpublicだけ。刺激正本と正答、別条件本文はWorker側にあり、参加者の静的JSには含めない。旧 `/stimulus/` と `/stimulus/case_data.js` は404にする。

参加者は管理画面で発行した一回限りのコードで開始。コードはDB内ではSHA-256のみ保持。セッションはランダムな参加者IDとHttpOnly/Secure/SameSite cookieで識別する。復帰用秘密値を本人ブラウザに保存し、Cookieを失ったときは同じコード・秘密値による再開が可能。同じコードで別セッションは作らない。別コードを入手した同一人物の検出はできない。

管理APIは管理キーまたは管理認証Cookieが必要。キーは公開アセットやURLに入れない。IP・氏名・メール・User-Agentをアプリの記録列として保存しない。Cloudflare自体のインフラ処理とは区別する。

## 最小粒度のイベント

| type | 記録内容 |
| --- | --- |
| editor_beforeinput | inputType、data、変換中フラグ、入力前選択位置、ブラウザイベント時刻 |
| editor_input | ブラウザの各inputイベントごとに差分（開始位置、削除文字、挿入文字、前後文字数）、入力後選択位置、inputType、変換状態 |
| editor_keydown / keyup | 編集欄内のkey/code、修飾キー、リピート、変換状態、選択位置。画面外・他入力欄のキーは記録しない |
| editor_compositionstart/update/end | 日本語などのIMEイベントとそのdata・選択位置 |
| editor_selection | 編集欄の選択開始・終了・方向 |
| editor_copy/cut/paste | 編集欄内で起きた操作と選択範囲。実際に挿入された文字はinput差分で記録。未貼付のクリップボード内容は取得しない |
| editor_snapshot | 編集画面表示・復帰時、および入力停止1.5秒後の保存チェックポイントで全文。最終提出文はsessionsにも固定 |
| source_open/close | 元資料・依頼・背景の識別子、開閉、スクロール位置 |
| scroll / wheel | 発生したイベントごとの対象、位置／スクロールサイズ、ホイール差分・単位 |
| pointermove | アプリ領域内のブラウザ配信イベント。getCoalescedEventsが利用可能なら統合前サンプルの座標・時刻・pressureも保存 |
| pointerdown/up/click | 対象、座標、ボタン、ポインタ種別、イベント時刻 |
| document_selection | アプリ内文書の選択オフセット・長さ・対象（選択文字自体は別途収集しない） |
| answer_change | 質問ID、変更ごとの値（確定回答とは別） |
| phase_render / action_requested | 描画時の区間・revision・画面サイズと遷移要求時点 |
| focusin/out, window_focus/blur, visibility | 操作対象のフォーカス、ウィンドウ・タブの状態 |
| window_online/offline/resize, pagehide | 通信状態、画面サイズ、離脱通知 |
| heartbeat | 10秒ごとの表示・フォーカス・通信状態 |

全イベントにevent_id、session_id、page_id、ページ内seq、phase、client_wall（ISO時刻）、client_mono（そのページ起動からのperformance.now差）、received_at（サーバー受信時刻）、payload_jsonがある。文字位置はJavaScriptのUTF-16コード単位。イベントごとの順序はpage_id＋seqを優先し、時計がずれる可能性のあるclient_wallを唯一の順序根拠にしない。ページをまたぐ順序はサーバーのactions/revision、描画・スナップショット、壁時計も併用する。

「最小粒度」はブラウザがJavaScriptへ渡したイベント単位。物理キーボード・OS内部の全イベントや視線、閲覧の理解は取得できない。スクロールや表示時間を認知負担・注視の直接測定と呼ばない。

## 通信・再開・確定

- イベントはIndexedDBに格納し、約2秒ごとに50件／約300k文字以内でまとめて送信。まとめるのは通信だけで、DBのイベント粒度を集約しない。
- サーバーのACK後にだけ端末キューから削除。同じevent_idまたはpage_id＋seqを再送しても重複挿入しない。
- 端末側の編集内容と質問の途中回答も保存。再読み込みで復元し、別タブの同時参加はWeb Locksで止める。
- 編集保存は増加する保存番号で古いリクエストによる上書きを防止。画面遷移はrevisionとaction_idを使い、再送は同一操作として扱う。
- 提出・次画面へ進む前に未送信ログを送信。D1への保存成功を確認してから次の段階へ遷移。提出後の編集APIは拒否する。
- オフライン中は端末キューを保持。接続後／同じブラウザでの再開時に再送する。端末データ消去・ストレージ故障・ページ強制終了直前の未完了書き込みまで無損失保証はしない。ページ離脱通知はベストエフォート。
- 参加終了後は追加の操作監視を止め、終了画面表示イベントを送信する。途中離脱で復帰しない参加者は進行中のまま残るため、最後のheartbeat等と併せて判断する。

## 書き出し

管理画面 `/admin` のNDJSON: sessions、responses、events、actions、versions。eventsは500件ごとのカーソルで全件取得。参加者別CSVは条件・時刻・主要負担・信頼・操作チェック・初稿・提出文を含む。欠測をゼロで補わず、mode=test/liveを保持。

大量ログは `node tools/export.mjs` で各ページを逐次ファイル追記する。既定出力 `.private/exports/日時/`。認証キーは `.private/admin-key.txt` またはADMIN_KEY環境変数から読み、出力しない。

確定時刻はactions、実際の描画・クリック時刻はeventsで観察する。ネットワーク待機時間や質問区間を作業時間へ自動合算しない。初読は最初のread描画〜読み終わり要求、仕上げはedit描画〜提出要求を基点とし、再開・非表示区間を区別して解析する。採点はsubmitted_textを使って別途実施。文書条件や負担を伏せた採点が必要。

## 版と未確定事項

versionsには刺激全文・ハッシュ・計画版、およびv3以降の測定定義・測定ハッシュを記録し、sessionsにも同じ計画版を保持する。初稿はセッションに固定されるが背景・質問は配備コードから供給するため、収集中の刺激／質問変更は禁止し、受付停止と参加状況を確認してから別版を配備する。今回のv3追加画面はv3セッションだけに適用し、旧v2セッションは追加質問を挟まず従来の順序で再開する。将来の質問変更も版を変え、旧版の手順を維持する必要がある。

## 責任帰属と補完判断（v3）

質問の正本はsrc/measurement.js。研究上の根拠・項目全文・分析方針は[測定仕様](../research-analysis-20260919/icaart/RESPONSIBILITY_MEASUREMENT.md)。responsibilityでrepair_need、sender_duty、sender_control、sender_unfinished、sender_blameを保存し、repair_appraisalでrecipient_duty、task_value、repair_reluctance、responsibility_influenceを保存する。最初の8項目は1–7、最後は0–6（3が影響なし）で、全項目にunknownを許す。空欄を0へ補わない。サーバーが項目ごとの範囲と必須回答を検証する。

各回答変更はanswer_change、画面表示はphase_render、確定回答はresponses、遷移はactionsに保存される。参加者別CSVは9項目を独立列とし、NDJSONも利用できる。責任質問への回答時間は仕上げ時間に含めない。尺度の合算、因果媒介の確証、AIへの責任の100%配分は行わない。旧版の未測定と新版の判断不可・途中離脱は区別する。

研究実施者・問い合わせ先・報酬・保存期間は管理画面から設定でき、同意時点の設定をconsent_jsonに固定保存する。未入力の連絡先等は募集案内参照の文面となる。実施者が実際の募集案内と整合させる。参加者募集、報酬の支払い、倫理審査の申請をこのシステムが実施するものではない。

ソフトウェア検証の記録はtest-resultsとテストコード。これを刺激妥当性や人間の負担差の検証と扱わない。

## Cloudflare上での一括保存の修正

公開環境で多数のイベントが滞留した状態からの遷移を検証し、D1への一イベント一クエリではWorkerあたりのクエリ制限に達し得るため、JSON配列をjson_eachで展開する単一INSERTへ変更した。保存される行は引き続き一イベント一行で、粒度は集約していない。参加リンクの一括発行も同様に一クエリ化。根拠：[Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)。

大量実施時の一日あたり書込数・データベース容量は、アカウント契約の上限に従う。一括クエリ化はその容量上限自体を増やす変更ではない。管理画面の記録数とCloudflareの使用量を確認して実施人数を管理する。


## 教示の改訂（2026-09-19 / recipient-20260919-v2）

開始説明は記録内容・参加条件・保管先を短い項目に分けた。同意後のintroを「役割／依頼／事前の質問／理解確認」の4画面に分割し、役割分担は2枠、提出要件は3項目、用語は定義リストで示す。編集画面の重複した教示を整理。刺激本文・質問・尺度・割付・サーバーの回答確定順序は変更していない。

教示内の「戻る」はintroの説明・事前回答の中だけで利用できる。introの確定・割付後に前段階へ戻る仕様ではない。途中回答と教示の表示位置を端末に保持し、instruction_stepイベントに画面番号・名称・UI版を保存。phase_renderにもuiVersionを追加。改訂時点の本番参加件数は0件であることを管理APIで確認した。
