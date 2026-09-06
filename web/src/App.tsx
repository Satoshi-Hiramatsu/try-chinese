import { useState } from 'react'

interface Friend {
  name: string
  avatar: string
  personality: string
  hobbies: string[]
}

const SAMPLE_FRIEND: Friend = {
  name: '陈美玲 (Chen Meiling)',
  avatar: '👩🏻‍🦰',
  personality: '親しみやすく好奇心旺盛、上海在住の大学生',
  hobbies: ['映画鑑賞', '三国志', '台湾料理']
}

export default function App() {
  const [hskLevel, setHskLevel] = useState<number>(2)

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-rose-50 to-orange-50 text-stone-800 flex flex-col items-center justify-between p-4 sm:p-8 font-sans">
      {/* Header */}
      <header className="w-full max-w-3xl flex items-center justify-between py-4 border-b border-rose-150/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center text-white font-bold text-xl shadow-md">
            中
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-stone-900 m-0">しゃべチャイナ</h1>
            <p className="text-xs text-stone-500 m-0">趣味の合う外国人の友達と、中国語で話す</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/80 backdrop-blur px-3 py-1.5 rounded-full border border-rose-200/50 shadow-xs">
          <span className="text-xs font-medium text-stone-600">HSK設定:</span>
          <select
            value={hskLevel}
            onChange={(e) => setHskLevel(Number(e.target.value))}
            aria-label="HSKレベル設定"
            className="text-xs font-semibold text-rose-600 bg-transparent border-none outline-none cursor-pointer"
          >
            {[1, 2, 3, 4, 5, 6].map((lvl) => (
              <option key={lvl} value={lvl}>
                HSK {lvl} 級
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-3xl flex-1 flex flex-col justify-center py-8 gap-6">
        {/* Friend Profile Card */}
        <div className="bg-white/90 backdrop-blur-md rounded-2xl p-6 shadow-xl shadow-rose-900/5 border border-white/60">
          <div className="flex items-start gap-4">
            <div className="text-4xl p-3 bg-rose-100/60 rounded-2xl">
              {SAMPLE_FRIEND.avatar}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white">Friend</span>
                <h2 className="text-lg font-bold text-stone-900 m-0">{SAMPLE_FRIEND.name}</h2>
              </div>
              <p className="text-sm text-stone-600 mt-1 mb-2">{SAMPLE_FRIEND.personality}</p>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_FRIEND.hobbies.map((hobby) => (
                  <span key={hobby} className="text-xs px-2.5 py-0.5 rounded-md bg-stone-100 text-stone-600 font-medium">
                    #{hobby}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Chat Preview / Sample Turn */}
        <div className="space-y-4">
          {/* User message */}
          <div className="flex justify-end">
            <div className="max-w-[85%] bg-rose-500 text-white rounded-2xl rounded-tr-xs px-4 py-3 shadow-md shadow-rose-500/20">
              <p className="text-sm m-0">你好！我想聊三国志。(三国志について話したいです)</p>
            </div>
          </div>

          {/* Friend message with Bilingual Reply + Correction */}
          <div className="flex items-start gap-3">
            <div className="text-2xl mt-1">{SAMPLE_FRIEND.avatar}</div>
            <div className="max-w-[85%] bg-white rounded-2xl rounded-tl-xs p-4 shadow-md shadow-stone-200/50 border border-rose-100 space-y-3">
              {/* Chinese text + Pinyin */}
              <div>
                <p className="text-xs text-rose-600 font-mono tracking-wide m-0">
                  Nǐ hǎo! Sānguó yǎnyì lǐ nǐ zuì xǐhuan nǎge rénwù?
                </p>
                <p className="text-base font-semibold text-stone-900 mt-0.5 mb-0">
                  你好！三国演义里你最喜欢哪个人物？
                </p>
                <p className="text-xs text-stone-500 mt-1 mb-0">
                  こんにちは！『三国志演義』の中で誰が一番好きですか？
                </p>
              </div>

              {/* Correction Box */}
              <div className="bg-amber-50/80 rounded-xl p-3 border border-amber-200/60 text-xs text-stone-700">
                <div className="flex items-center gap-1.5 text-amber-800 font-semibold mb-1">
                  <span>💡</span>
                  <span>発話添削 (Correction)</span>
                </div>
                <p className="m-0 text-stone-600">
                  「聊三国志」でも通じますが、「聊聊三国演义 (liáoliao sānguó yǎnyì)」と言うとより自然で親しみやすい表現になります！
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Status / Feature Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
          <div className="bg-white/70 p-3 rounded-xl text-center border border-white/60 shadow-xs">
            <div className="text-xs text-stone-500">HSK 適応制御</div>
            <div className="text-sm font-bold text-stone-800 mt-0.5">HSK 1〜6 級</div>
          </div>
          <div className="bg-white/70 p-3 rounded-xl text-center border border-white/60 shadow-xs">
            <div className="text-xs text-stone-500">ピンイン表示</div>
            <div className="text-sm font-bold text-rose-600 mt-0.5">常時表示</div>
          </div>
          <div className="bg-white/70 p-3 rounded-xl text-center border border-white/60 shadow-xs">
            <div className="text-xs text-stone-500">発話添削</div>
            <div className="text-sm font-bold text-amber-600 mt-0.5">毎回優しく提示</div>
          </div>
          <div className="bg-white/70 p-3 rounded-xl text-center border border-white/60 shadow-xs">
            <div className="text-xs text-stone-500">音声（STT/TTS）</div>
            <div className="text-sm font-bold text-stone-800 mt-0.5">中・日両対応</div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-3xl text-center py-4 border-t border-rose-100 text-xs text-stone-400">
        しゃべチャイナ MVP - React + Vite + Cloudflare Workers + Hono (PWA Ready)
      </footer>
    </div>
  )
}
