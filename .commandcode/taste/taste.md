# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# communication
- Use Portuguese for all communication with this user. Confidence: 0.85
- Use Google's native OAuth service (via Supabase or Google's own APIs) instead of third-party providers like Privy. Confidence: 0.65
- Structure responses in this exact format: Diagnóstico → Localização → Correção → Explicação → Melhorias. Confidence: 0.85

# code-analysis
- Perform deep, thorough analysis identifying root cause before proposing solutions; do not provide superficial fixes. Confidence: 0.80
- Consider performance, security, scalability, and maintainability when suggesting corrections. Confidence: 0.75
- Before responding to code issues, analyze the full context including code, errors, logs, dependencies, versions, project structure, and environment configuration. Confidence: 0.80

# git
- For frontend changes (tradutor-frontend, tradutor-extensao): do NOT make commits or push without the user explicitly asking; only apply changes locally and wait for user instructions. Backend changes stay local on user's machine. Confidence: 0.75
- When debugging API key/auth issues with Supabase, always check both new format (sb_publishable_/sb_secret_) and legacy JWT format keys are valid in the Supabase dashboard before concluding a key is invalid. Confidence: 0.65

# marketing
- For landing pages: sell the transformation/outcome, not the technology or features. Confidence: 0.75
- Structure landing pages with: emotional hero → social proof/platforms → before/after transformation → differentiators → use cases → roadmap → FAQ → CTA. Confidence: 0.70
- When user provides detailed creative suggestions, interpret the concept/spirit rather than copying literally. Confidence: 0.65

# workflow
- Before modifying files in production folders (tradutor-frontend, tradutor-extensao), first prototype/test changes in a separate sandbox folder (e.g., "teste") to avoid polluting the GitHub-tracked project. Apply to production only after user confirms. Confidence: 0.75

# ui-design
- Use a single consistent Google Fonts combination throughout the project; do not mix multiple fonts. Confidence: 0.70
- Maintain the approved color palette (black, gray, orange, brown) and avoid generic tech colors like cyan or strong purple. Confidence: 0.65
- Avoid mixing English and Portuguese terms in the UI; pick one language and stay consistent. Confidence: 0.60
- Block/avoid hallucination-prone AI jargons and overused AI-generated terms in UI copy. Confidence: 0.65
- Never use emojis in UI copy; they compromise the project's serious/professional tone. Confidence: 0.70

