export interface VendorSkillMeta {
  /**
   * git source
   */
  source: string
  /**
   * sourceSkillName -> outputSkillName
   */
  skills: Record<string, string>
}

/**
 * Already generated skills, sync with their `skills/` directory
 */
export const vendors: Record<string, VendorSkillMeta> = {
  vueuse: {
    source: 'https://github.com/vueuse/vueuse',
    skills: {
      'vueuse-functions': 'vueuse-functions',
    },
  },
  tsdown: {
    source: 'https://github.com/rolldown/tsdown',
    skills: {
      tsdown: 'tsdown',
    },
  },
  turborepo: {
    source: 'https://github.com/vercel/turborepo',
    skills: {
      turborepo: 'turborepo',
    },
  },
}
