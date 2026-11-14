// Jedan isti prompt za svakog gosta.
// Namerno ne pominje nijednu konkretnu igru, brend ni reč "crime" (manje odbijanja filtera).
// Očuvanje lica je na početku jer model daje veću težinu ranijem tekstu.
// Menja se samo ovde; posle izmene ponovo pokrenuti deploy.

export const STYLE_PROMPT = `Keep the person in this photo clearly recognizable: same face, facial features, skin tone, hairstyle, hair color, glasses, facial hair, and the same clothing and colors. Do not change age, gender or body type. Keep the same number of people.

Turn the photo into a stylized illustration in the style of a classic open-world action video game loading screen artwork.

Style: bold hand-painted digital illustration, strong clean ink outlines, cel-shaded skin with crisp highlights, slightly exaggerated confident pose, saturated sunset color palette (orange, magenta, purple sky), palm trees and a sunny coastal city skyline in the background, subtle halftone texture, poster composition, vertical framing from the waist up.

Do not add any text, letters, logos, watermarks, weapons, drugs, alcohol or violence.`;
