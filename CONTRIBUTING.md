# Contributing to DocuFind

First off, thank you for considering contributing to DocuFind! 🎉

## How Can I Contribute?

### 🐛 Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

When creating a bug report, include:

- **Clear title** describing the issue
- **Steps to reproduce** the behavior
- **Expected behavior** vs what actually happened
- **Screenshots** if applicable
- **Environment info**: OS, DocuFind version, etc.

### 💡 Suggesting Features

Feature requests are welcome! Please:

- Check if the feature has already been requested
- Describe the feature and why it would be useful
- Include any relevant use cases

### 🔧 Pull Requests

1. **Fork the repo** and create your branch from `main`
2. **Install dependencies**: `npm install`
3. **Make your changes**
4. **Test your changes**: `npm run tauri dev`
5. **Ensure code quality**: `npm run lint`
6. **Submit a PR** with a clear description

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (latest stable)
- [Tauri Prerequisites](https://tauri.app/v2/guides/getting-started/prerequisites/)

### Getting Started

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/docufind.git
cd docufind

# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Project Structure

```
docufind/
├── src/                    # Next.js frontend (React)
│   ├── app/               # App router pages
│   ├── components/        # React components
│   └── lib/               # Utilities & Tauri adapter
├── src-tauri/             # Rust backend
│   ├── src/lib.rs        # Core logic (search, indexing)
│   └── tauri.conf.json   # Tauri configuration
└── public/               # Static assets
```

### Code Style

- **Frontend**: Follow existing patterns, use TypeScript
- **Backend**: Follow Rust conventions, run `cargo fmt`
- **Commits**: Use clear, descriptive commit messages

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment. We expect all contributors to:

- Be respectful and considerate
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy towards others

### Unacceptable Behavior

- Harassment, trolling, or personal attacks
- Discriminatory language or imagery
- Publishing others' private information

### Enforcement

Violations may result in temporary or permanent bans from the project.

## Questions?

Feel free to open an issue or reach out if you have questions!

---

Thank you for helping make DocuFind better! 🚀
