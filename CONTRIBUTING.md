# Contributing to codex-pocket

Thanks for your interest! Here's how to get started.

## Quick Setup

```bash
git clone https://github.com/NikitaSH999/codex-pocket.git
cd codex-pocket
npm install
npm run dev
```

## Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (client + server) |
| `npm run build` | Production build |
| `npm test` | Run tests |
| `npm run test:watch` | Tests in watch mode |

## Requirements

- Node.js ≥ 18
- `codex` CLI installed (`npm i -g @openai/codex`)
- OpenAI API key configured

## Pull Requests

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -m 'feat: add something cool'`)
4. Push to the branch (`git push origin feat/my-feature`)
5. Open a Pull Request

### Conventions

- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`)
- Write tests for new features
- Keep PRs focused — one feature per PR

## Bug Reports

Open an issue with:
- What you expected
- What actually happened
- Steps to reproduce
- OS and Node.js version

## Code Style

- TypeScript strict mode
- No `any` unless absolutely necessary
- Functional components in React
- CSS modules over inline styles

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
