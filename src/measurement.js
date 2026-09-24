// Questionnaire definitions. v5 (2026-09-24, protocol v8): between-participants, one case per participant; 4 content conditions (baseline, missing_info, off_focus, source_deviation) x AI disclosure; primary outcome = pre-edit sufficiency; factual manipulation checks precede the perception block.
// Existing scales are used where a published scale fits; adaptations and study-specific items are flagged in `source`.
// Japanese wordings of English scales are research translations (no back-translation yet); see the manuscript for citations.
export const PROTOCOL_VERSION='recipient-20260925-v8';
export const V5_VERSIONS=['recipient-20260921-v5','recipient-20260921-v5.1','recipient-20260921-v6','recipient-20260921-v7','recipient-20260921-v7.2','recipient-20260925-v8'];
export const LEGACY_V4='recipient-20260921-v4';
export const LEGACY_V3='recipient-20260919-v3';
export const CASES_PER_PARTICIPANT=1; // v8: between-participants, one case each
export const READ_GATE_SECONDS=45; // default; override with the READ_GATE_SECONDS binding (tests use a short value)
export const DURATION_TEXT='おおよそ 10〜20 分程度';
export const SENDERS=['佐藤','鈴木','高橋','田中'];
const AGREE={min:1,max:7,unknown:false,ends:'1：まったくそう思わない ／ 7：非常にそう思う'};
const q=(id,text,extra={})=>({id,text,...AGREE,...extra});

export const measurement={
  version:'questionnaire-20260924-v5',
  terminology:'文書は「報告案」、送り手は「{sender}さん」で統一。',
  rating:'同意評定は1（まったくそう思わない）〜7（非常にそう思う）の7件法。v5.1で「判断できない」を廃止（元尺度に合わせ、主要指標の欠測を避ける）。想起の「覚えていない」のみ残す。',
  sources:{
    aimq:'Lee, Strong, Kahn & Wang (2002) AIMQ, Information & Management 40(2). Completeness 6 items (alpha .87), Free-of-error, Understandability. Adapted: "this information" -> 今回の報告案, "our work/task" -> 今回の判断・依頼.',
    trust:'Mayer & Davis (1999) J. Applied Psychology 84(1), 4-item trust (willingness to be vulnerable). Adapted from top management to the colleague {sender}さん. Items 1 and 3 reverse-scored.',
    propensity:'Frazier, Johnson & Fainshmidt (2013) J. Trust Research 3(2), 4-item propensity to trust (alpha .84).',
    tlx:'NASA-TLX raw (unweighted) version; Japanese subscale names per 芳賀・水上 (1996) 人間工学 32(2). Definitions adapted from the original NASA-TLX descriptions. Score = unweighted mean of six 0-100 ratings (RTLX).',
    responsibility:'Study-specific items (responsibility-20260919-v1), grounded in Schlenker et al. 1994, Malle et al. 2014, Hohenstein & Jung 2020, Williams & Karau 1991.',
    perception:'Six content viewpoints (manuscript Table 1) as single items; perc_1 and read_ease follow AIMQ free-of-error / understandability wording.',
    fmc:'Factual manipulation checks (Kane & Barabas 2019): three yes/no/do-not-remember items about the received draft, worded per case (cases.js fmc), placed at the top of the perception block; keyed answers per condition in cases.common.fmcKeyed.'
  },
  blocks:{
    background:{title:'事前の質問',instruction:'あなた自身について答えてください。',questions:[
      {id:'bg_work',type:'choice',text:'これまでに、職場で報告書や資料を受け取って確認・修正する仕事をした経験はどの程度ありますか。',options:['経験はない','少しある','ある','多い'],source:'study'},
      {id:'bg_dom_1',type:'choice',text:'会社の設備や省エネに関わる仕事をした経験はどの程度ありますか。',options:['経験はない','少し知っている','補助的に関わったことがある','担当したことがある'],source:'study'},
      {id:'bg_dom_2',type:'choice',text:'役所や公共機関の窓口・案内の仕事をした経験はどの程度ありますか。',options:['経験はない','少し知っている','補助的に関わったことがある','担当したことがある'],source:'study'},
      {id:'bg_dom_3',type:'choice',text:'予約や宿泊など、サービス業の運営に関わる仕事をした経験はどの程度ありますか。',options:['経験はない','少し知っている','補助的に関わったことがある','担当したことがある'],source:'study'},
      {id:'bg_ai',type:'choice',text:'普段、生成AIを使う頻度を教えてください。',options:['使ったことがない','試したことがある','月に数回程度','週に数回程度','ほぼ毎日'],source:'study (v3)'},
      q('ptt_1','私はふつう、信頼できないという理由が示されない限り、人を信頼する。',{source:'propensity'}),
      q('ptt_2','他人を信頼することは、私にとって難しいことではない。',{source:'propensity'}),
      q('ptt_3','初対面の人でも、信頼すべきでないと分かるまでは信頼するのが、私のいつものやり方だ。',{source:'propensity'}),
      q('ptt_4','私は、他人を信頼する傾向が強い。',{source:'propensity'})
    ]},
    cognition:{title:'報告案について',instruction:'今の報告案に書いてあることだけを評価してください。資料を読んで自分で分かったことは、報告案に書いてあることに含めないでください。',questions:[
      q('suff_1','この報告案には、今回の判断に必要な情報がすべて含まれている。',{source:'aimq completeness'}),
      q('suff_2','この報告案の情報は、不完全である。',{source:'aimq completeness',reverse:true}),
      q('suff_3','この報告案の情報は、完全である。',{source:'aimq completeness'}),
      q('suff_4','この報告案の情報は、今回の依頼に対して十分に完全である。',{source:'aimq completeness'}),
      q('suff_5','この報告案の情報は、今回の判断に必要なことをカバーしている。',{source:'aimq completeness'}),
      q('suff_6','この報告案の情報は、今回の判断に対して十分な広さと深さを持っている。',{source:'aimq completeness'}),
      q('comp_1','この報告案は、文章として整っている。',{source:'study'}),
      q('comp_2','この報告案は、仕上がった報告書のように見える。',{source:'study'}),
      q('tr_1','できることなら、自分にとって重要な仕事には{sender}さんを関わらせたくない。',{source:'trust',reverse:true}),
      q('tr_2','自分の担当する仕事の重要な部分を、{sender}さんに任せてもよいと思う。',{source:'trust'}),
      q('tr_3','{sender}さんの仕事ぶりを、しっかり監視できる手段があればよいと思う。',{source:'trust',reverse:true}),
      q('tr_4','自分で確認できない状況でも、自分にとって重要な仕事を{sender}さんに安心して任せられる。',{source:'trust'})
    ]},
    post:{title:'提出までの作業について',instruction:'報告案を読んでから提出するまでの作業について答えてください。この質問への回答は含めません。',questions:[
      {id:'effort_total',type:'scale',min:1,max:7,unknown:false,ends:'1：まったく費やさなかった ／ 7：非常に多く費やした',text:'報告案を読み、資料を確認し、必要な修正をして提出するまでに、どの程度の精神的な努力を費やしましたか。',source:'study (single-item mental effort)'},
      {id:'tlx_md',type:'range',min:0,max:100,step:5,label:'知的・知覚的要求',ends:['低い','高い'],text:'どの程度の知的・知覚的な活動（考える、判断する、記憶する、読む、探すなど）が必要でしたか。作業はやさしかったですか、難しかったですか。単純でしたか、複雑でしたか。',source:'tlx'},
      {id:'tlx_pd',type:'range',min:0,max:100,step:5,label:'身体的要求',ends:['低い','高い'],text:'どの程度の身体的な活動（入力する、操作するなど）が必要でしたか。',source:'tlx'},
      {id:'tlx_td',type:'range',min:0,max:100,step:5,label:'タイムプレッシャー',ends:['低い','高い'],text:'作業のペースや速さについて、どの程度の時間的な切迫感を感じましたか。',source:'tlx'},
      {id:'tlx_op',type:'range',min:0,max:100,step:5,label:'作業成績',ends:['良い','悪い'],text:'依頼に応える報告書を仕上げるという目標に対して、どの程度うまくできたと思いますか。',source:'tlx'},
      {id:'tlx_ef',type:'range',min:0,max:100,step:5,label:'努力',ends:['低い','高い'],text:'その成績に到達するために、精神的・身体的にどのくらい一生懸命に取り組む必要がありましたか。',source:'tlx'},
      {id:'tlx_fr',type:'range',min:0,max:100,step:5,label:'フラストレーション',ends:['低い','高い'],text:'作業中、どのくらい不安、いらだち、ストレス、不快感を感じましたか。安心や満足を感じた場合は低い側です。',source:'tlx'}
    ]},
    trust_post:{title:'{sender}さんについて',instruction:'提出を終えた今の気持ちで答えてください。',questions:[
      q('tr_1','できることなら、自分にとって重要な仕事には{sender}さんを関わらせたくない。',{source:'trust',reverse:true}),
      q('tr_2','自分の担当する仕事の重要な部分を、{sender}さんに任せてもよいと思う。',{source:'trust'}),
      q('tr_3','{sender}さんの仕事ぶりを、しっかり監視できる手段があればよいと思う。',{source:'trust',reverse:true}),
      q('tr_4','自分で確認できない状況でも、自分にとって重要な仕事を{sender}さんに安心して任せられる。',{source:'trust'})
    ]},
    responsibility:{title:'受け取った報告案と役割について',instruction:'この案件の報告案（{sender}さんの報告案）を受け取ってから提出するまでを思い出して答えてください。足りないところや追加の作業がなかった場合も、そのまま答えてください。',questions:[
      q('repair_need','依頼に応えるため、最初の報告案には内容を補う必要があった。',{source:'responsibility',ends:'1：まったく当てはまらない ／ 7：非常によく当てはまる'}),
      q('sender_duty','依頼に沿った内容に整えてから報告案を渡すことは、{sender}さんの責任だったと思う。',{source:'responsibility',ends:'1：まったく当てはまらない ／ 7：非常によく当てはまる'}),
      q('sender_control','{sender}さんは、渡す前に報告案の内容を確認し、必要な修正をすることができたと思う。',{source:'responsibility',ends:'1：まったく当てはまらない ／ 7：非常によく当てはまる'}),
      q('sender_unfinished','自分が引き受けた作業には、{sender}さんが報告案を渡す前に済ませるべきだったものがあった。',{source:'responsibility',ends:'1：まったく当てはまらない ／ 7：非常によく当てはまる'}),
      q('sender_blame','この報告案をそのまま渡したことについて、{sender}さんには落ち度があると思う。',{source:'responsibility',ends:'1：まったく当てはまらない ／ 7：非常によく当てはまる'}),
      q('recipient_duty','報告案に不足があれば、自分が補ってから提出する責任があると思った。',{source:'responsibility',ends:'1：まったく当てはまらない ／ 7：非常によく当てはまる'}),
      q('task_value','今回の依頼に十分応えられる報告書を完成させることは、自分にとって重要だった。',{source:'responsibility',ends:'1：まったく当てはまらない ／ 7：非常によく当てはまる'}),
      q('repair_reluctance','{sender}さんに代わって報告案の不足を補うことに、抵抗を感じた。',{source:'responsibility',ends:'1：まったく当てはまらない ／ 7：非常によく当てはまる'}),
      {id:'responsibility_influence',type:'scale',min:0,max:6,unknown:false,ends:'0：大きく減らす方向 ／ 3：影響しなかった ／ 6：大きく増やす方向',text:'{sender}さんの責任をどう考えたかは、自分が確認・修正に力をかける程度に、どのように影響したと思いますか。',source:'responsibility'}
    ]},
    reflection:{title:'案件を通して',instruction:'今回の案件を通して感じたことを答えてください。',questions:[
      {id:'resp_free',type:'text',required:false,maxLength:2000,text:'今回の案件を通して、同僚の責任をどう捉え、それが確認・修正の仕方にどう関わったと思いますか。（任意・自由記述）',source:'study'}
    ]},
    perception:{title:'最初の報告案について（{title}）',instruction:'この案件で、{sender}さんから最初に届いた報告案について答えてください。あなたが直した後の文章ではなく、届いたときの報告案についてです。',questions:[
      q('perc_1','最初の報告案の記述は、元資料に照らして正確だった。',{source:'perception/aimq free-of-error'}),
      q('perc_2','最初の報告案には、今回の判断に必要な情報が含まれていた。',{source:'perception'}),
      q('perc_3','最初の報告案は、依頼された調査・試行の方針に答えていた。',{source:'perception'}),
      q('perc_4','最初の報告案では、根拠と方針のつながりが分かった。',{source:'perception'}),
      q('perc_5','最初の報告案では、資料で確かめられた範囲と、今回の対象への見込みが区別されていた。',{source:'perception'}),
      q('perc_6','最初の報告案から、次に何を確認すべきかが分かった。',{source:'perception'}),
      q('read_ease','最初の報告案の文章は読みやすかった。',{source:'aimq understandability'}),
      q('natural','最初の報告案は、業務の報告案として自然だった。',{source:'study (v3)'}),
      q('certainty','最初の報告案の結論は、確信を持った言い方だった。',{source:'study (v3)'})
    ]},
    recall:{title:'報告案の作成方法について',instruction:'最後に、この調査で受け取った報告案の作成方法について答えてください。',questions:[
      {id:'memory',type:'choice',text:'受け取った報告案に、作成方法についての説明はありましたか。',options:['生成AIを使ったという説明があった','作成方法の説明はなかった','覚えていない'],source:'study (disclosure check; v8 one case: 0=説明あり,1=なし,2=覚えていない)'},
      {id:'disc_confidence',type:'scale',min:1,max:7,unknown:false,ends:'1：まったく自信がない ／ 7：確信している',text:'いまの答え（作成方法の説明があったかどうか）に、どの程度自信がありますか。',source:'study (disclosure check)'},
      {id:'belief',type:'scale',min:1,max:7,unknown:false,ends:'1：まったく思わなかった ／ 7：非常に強く思った',text:'作業中、受け取った報告案に生成AIが使われたと、どの程度思っていましたか。',source:'study (v3)'},
      {id:'disc_attention',type:'scale',min:1,max:7,unknown:false,ends:'1：まったく意識しなかった ／ 7：常に意識していた',text:'作業中、報告案の作成方法（生成AIを使ったかどうか）をどの程度意識していましたか。',source:'study (disclosure check)'},
      {id:'disc_influence',type:'scale',min:0,max:6,unknown:false,ends:'0：確認や修正を減らす方向 ／ 3：影響しなかった ／ 6：確認や修正を増やす方向',text:'報告案の作成方法について考えたことは、確認・修正の仕方にどのように影響しましたか。',source:'study (disclosure check)'},
      {id:'disc_free',type:'text',required:false,maxLength:2000,text:'報告案の作成方法について考えたことや、表示を見て感じたことがあれば書いてください。（任意・自由記述）',source:'study (disclosure check)'}
    ]},
    attitude:{title:'生成AIについて',instruction:'最後に、生成AI全般についてのあなたの考えを答えてください。',questions:[
      q('aias_1','AIは私の生活をよくすると思う。',{source:'aias-4'}),
      q('aias_2','AIは私の仕事をよくすると思う。',{source:'aias-4'}),
      q('aias_3','私は将来、AI技術を使うと思う。',{source:'aias-4'}),
      q('aias_4','AI技術は人類にとって良いものだと思う。',{source:'aias-4'})
    ]}
  }
};
// Phase order for v5 (k cases per participant). Per-case phases carry a 1-based index suffix.
export const CASE_PHASES=['materials','read','cognition','edit','post','trust_post','perception','responsibility'];
export function phaseList(k=CASES_PER_PARTICIPANT){const list=['intro'];for(let i=1;i<=k;i++)for(const p of CASE_PHASES)list.push(`${p}_${i}`);list.push('reflection','recall','attitude','complete');return list}
export const PHASES_V5=[...phaseList(),'withdrawn'];
export const splitPhase=phase=>{const m=/^([a-z_]+?)(?:_(\d+))?$/.exec(phase);return {base:m?m[1]:phase,index:m&&m[2]?Number(m[2]):null}};
export const isV5=version=>V5_VERSIONS.includes(version);
export function nextPhase(phase,version){if(!isV5(version))return undefined;const l=phaseList();const i=l.indexOf(phase);return i<0?undefined:l[i+1]}
export const blockFor=phase=>measurement.blocks[splitPhase(phase).base]||null;
export function scoringNotes(){return {
  S:'suff_1..suff_6 の平均（suff_2 は逆転: 8-x）。6項目とも数値回答の場合のみ。案件ごと（cognition_1..3）に算出。',
  trust:'tr_1..tr_4 の平均（tr_1, tr_3 は逆転）。編集前（cognition）と提出後（trust_post）で同一項目。',
  propensity:'ptt_1..ptt_4 の平均。処置前変数。',
  rtlx:'tlx_md, tlx_pd, tlx_td, tlx_op, tlx_ef, tlx_fr の無加重平均（0-100）。下位尺度も別に報告。',
  effort_total:'単項目 0-10。RTLX と併記。',
  unknown:'v5.1以降は判断できないを提示しない。v5（2026-09-21 配備分の動作確認セッション）に残るunknownは欠測として扱う。'
}}
