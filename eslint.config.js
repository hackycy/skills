// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
    ignores: [
      '**/skills/**',
      '.scratch/**',
    ],
    rules: {
      'no-console': 'off',
    },
  },
)
