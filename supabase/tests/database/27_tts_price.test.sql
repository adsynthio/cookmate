-- Launch prep: the voice cost report prices Bulbul v3 at Sarvam's list price (Rs 30 per 10,000 characters).
begin;
select plan(2);

select is((select input_per_million from private.usage_prices where model = 'bulbul:v3'), 3000::numeric,
  'Bulbul v3 costs Rs 3000 per million characters');
select is(round(private.usage_cost_inr('bulbul:v3', 10000, 0, 0), 2), 30.00::numeric,
  '10,000 characters of step audio cost Rs 30');

select * from finish();
rollback;
