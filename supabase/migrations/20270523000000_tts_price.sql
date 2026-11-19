-- Sarvam lists Bulbul v3 text to speech at Rs 30 per 10,000 characters (Rs 15 was the Bulbul v2 price), so the
-- voice cost report under-counted step audio by half. Price per million characters: 30 * 100 = 3000.
-- Source: sarvam.ai/api-pricing and docs.sarvam.ai/api/pricing, checked Nov 2026 (docs/LAUNCH_PLAN.md).
update private.usage_prices
   set input_per_million = 3000,
       note = 'Sarvam text to speech, Bulbul v3: Rs 30 per 10,000 characters (Sarvam pricing page, Nov 2026)',
       updated_at = now()
 where model = 'bulbul:v3';

update private.usage_prices
   set note = 'Sarvam speech to text: Rs 30 per hour, billed per second (Sarvam pricing page, Nov 2026)',
       updated_at = now()
 where model = 'saaras:v3';
