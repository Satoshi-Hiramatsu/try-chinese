import type { LlmTopicLevel } from '../types'

export interface LlmTopicDefinition {
  id: LlmTopicLevel
  label: string
  description: string
  enabled: boolean
}

export const LLM_TOPIC_LEVELS: readonly LlmTopicDefinition[] = [
  { id: 'P0', label: 'P0 統制', description: '完全に無害な雑談', enabled: true },
  { id: 'P1', label: 'P1 ほのめかし', description: '恋愛・身体・スキンシップへの婉曲な示唆', enabled: true },
  { id: 'P2', label: 'P2 婉曲語彙', description: '婉曲的・俗語的な語彙を含む話題', enabled: true },
  { id: 'P3', label: 'P3 直接的語彙', description: '下品な語彙を含む話題（規約で許可されるモデルのみ）', enabled: true },
  { id: 'P4', label: 'P4 露骨な要求', description: '規約上の理由により未対応', enabled: false },
]

export function isModelAllowedForTopic(modelId: string, topicLevel: LlmTopicLevel): boolean {
  if (topicLevel === 'P4') return false
  if (topicLevel === 'P3' && modelId.startsWith('deepseek/')) return false
  return true
}
