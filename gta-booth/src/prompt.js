// Jedan isti prompt za svakog gosta.
// v3 (14. 11. 2026): prompt agencije, doslovno (odluka agencije, bez dodatnih zabrana).
// Napomena: pominje igru po imenu i nema zabranu teksta/logoa/oružja; videti PLAN.md, 9 i R15.
// Menja se samo ovde; posle izmene ponovo pokrenuti deploy.

export const STYLE_PROMPT = `Transform this image into a modern Grand Theft Auto VI-inspired visual style.
Preserve the original composition, subject identity, pose, and facial features, but enhance it with a highly polished, next-gen video game aesthetic.
Apply:
- Ultra-realistic rendering with cinematic lighting
- High dynamic range (HDR), realistic shadows and reflections
- Detailed skin textures and natural imperfections (not cartoonish)
- Subtle stylization inspired by GTA VI character design (modern, grounded, semi-realistic - NOT exaggerated or comic-like)
- Vibrant but controlled color grading (Miami/Vice City-inspired tones, warm highlights, teal
shadows.
- Depth of field and environmental atmosphere for immersion
- Clean, sharp focus with AAA video game quality
Environment:
- If applicable, enhance background to feel like a living open-world city (modern Vice City vibe: neon lights, palm trees, urban luxury, night glow or sunset lighting)
Important constraints:
- Do NOT convert into cartoon, comic, or GTA V-style illustration
- Avoid thick outlines or exaggerated proportions
- Maintain realism with subtle stylization only
- Keep the subject recognizable and authentic
Final result:
A cinematic, next-generation GTA VI-style render that looks like a scene from a modern AAA open-world game.`;
