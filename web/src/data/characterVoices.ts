/**
 * 声質キャラクター（話者プリセット）の定義
 * Kokoro-82m (中国語8話者) および Edge TTS (Online Natural) に完全対応
 */

export interface CharacterVoiceOption {
  id: string
  name: string
  gender: 'female' | 'male'
  character: string
  recommendFor: string
  desc: string
  edgeVoiceName: string
  qwenVoice: string
  kokoroVoice: string
  defaultRate: number
  defaultPitch: number
  isCustom?: boolean
}

export const CHARACTER_VOICE_OPTIONS: CharacterVoiceOption[] = [
  // --- 男性ボイス (Male Voices) ---
  {
    id: 'char-yunxi',
    name: '青年男性・知性的で温かみのある声 (Yunxi)',
    gender: 'male',
    character: '落ち着き・論理的',
    recommendFor: '王浩 (ITエンジニア)',
    desc: '20代の落ち着いた爽やかなトーン。明瞭で聞き取りやすいネイティブ発音。',
    edgeVoiceName: 'Microsoft Yunxi Online (Natural) - Chinese (Mainland)',
    qwenVoice: 'loongjohn',
    kokoroVoice: 'zm_yunxi',
    defaultRate: 0.95,
    defaultPitch: 0.85,
  },
  {
    id: 'char-yunjian',
    name: '男性・快活でエネルギッシュな声 (Yunjian)',
    gender: 'male',
    character: '元気・前向き',
    recommendFor: '張偉 (フィットネス)',
    desc: 'ハキハキと力強いトーン。スポーツや日常のテンポ良い会話に最適。',
    edgeVoiceName: 'Microsoft Yunjian Online (Natural) - Chinese (Mainland)',
    qwenVoice: 'loongjohn',
    kokoroVoice: 'zm_yunjian',
    defaultRate: 1.05,
    defaultPitch: 0.95,
  },
  {
    id: 'char-yunyang',
    name: '成人男性・誠実で落ち着いたプロ声 (Yunyang)',
    gender: 'male',
    character: '誠実・重厚・知性',
    recommendFor: '文化・ビジネス・解説',
    desc: '深く響く落ち着いたトーン。ニュースや深みのある対話に適した信頼感ある声。',
    edgeVoiceName: 'Microsoft Yunyang Online (Natural) - Chinese (Mainland)',
    qwenVoice: 'loongjohn',
    kokoroVoice: 'zm_yunyang',
    defaultRate: 0.92,
    defaultPitch: 0.82,
  },
  {
    id: 'char-yunxia',
    name: '少年〜若者・元気で親しみやすい声 (Yunxia)',
    gender: 'male',
    character: '明るい・少年・フランク',
    recommendFor: '学生・アニメ・ゲーム仲間',
    desc: '若々しく親近感の湧くトーン。同年代のカジュアルな日常会話にぴったり。',
    edgeVoiceName: 'Microsoft Yunxia Online (Natural) - Chinese (Mainland)',
    qwenVoice: 'loongjohn',
    kokoroVoice: 'zm_yunxia',
    defaultRate: 1.02,
    defaultPitch: 1.02,
  },

  // --- 女性ボイス (Female Voices) ---
  {
    id: 'char-xiaoxiao',
    name: '女性・明るく親しみやすい友達声 (Xiaoxiao)',
    gender: 'female',
    character: '明るい・フランク',
    recommendFor: '陳美玲 (上海大学生)',
    desc: '同年代の友達と雑談しているような自然で生き生きとしたトーン。',
    edgeVoiceName: 'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)',
    qwenVoice: 'longanhuan_v3.6',
    kokoroVoice: 'zf_xiaoxiao',
    defaultRate: 0.96,
    defaultPitch: 1.05,
  },
  {
    id: 'char-xiaoyi',
    name: '女性・優しく愛らしいのんびり声 (Xiaoyi)',
    gender: 'female',
    character: '愛嬌・癒やし',
    recommendFor: '李雪 (成都デザイナー)',
    desc: '柔らかく優しいニュアンス。初心者の聞き取りにも最適な心地よい癒やしボイス。',
    edgeVoiceName: 'Microsoft Xiaoyi Online (Natural) - Chinese (Mainland)',
    qwenVoice: 'longanhuan_v3.6',
    kokoroVoice: 'zf_xiaoyi',
    defaultRate: 0.88,
    defaultPitch: 1.15,
  },
  {
    id: 'char-xiaochen',
    name: '女性・穏やかで上品な大人の声 (Xiaochen)',
    gender: 'female',
    character: '上品・穏やか',
    recommendFor: '林子涵 (杭州写真家)',
    desc: '品格があり旅情を感じさせる、クリアで落ち着きのある大人の発音。',
    edgeVoiceName: 'Microsoft Xiaochen Online (Natural) - Chinese (Mainland)',
    qwenVoice: 'longanhuan_v3.6',
    kokoroVoice: 'zf_xiaobei',
    defaultRate: 0.92,
    defaultPitch: 0.96,
  },
  {
    id: 'char-xiaoni',
    name: '女性・キュートで元気な少女声 (Xiaoni)',
    gender: 'female',
    character: '愛嬌・元気・妹分',
    recommendFor: 'ポップ・日常会話・楽しい雑談',
    desc: '表情豊かで愛嬌のある声。テンポ良く楽しい会話や初心者のモチベーションに。',
    edgeVoiceName: 'Microsoft Xiaoni Online (Natural) - Chinese (Mainland)',
    qwenVoice: 'longanhuan_v3.6',
    kokoroVoice: 'zf_xiaoni',
    defaultRate: 1.00,
    defaultPitch: 1.18,
  },
  {
    id: 'char-xiaobei',
    name: '女性・知的で明瞭なナレーション風の澄んだ声 (Xiaobei)',
    gender: 'female',
    character: '明瞭・知的・クリア',
    recommendFor: '発音練習・正確な四声学習',
    desc: '透き通るような美しい標準発音。正確な中国語のリスニングとシャドーイングに最適。',
    edgeVoiceName: 'Microsoft Xiaobei Online (Natural) - Chinese (Mainland)',
    qwenVoice: 'longanhuan_v3.6',
    kokoroVoice: 'zf_xiaobei',
    defaultRate: 0.94,
    defaultPitch: 1.00,
  },
]
