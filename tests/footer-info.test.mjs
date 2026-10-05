import test from 'node:test';
import assert from 'node:assert/strict';
import { setupModules } from './helpers.mjs';

test('weather city defaults, persists without touching other data and preserves damaged storage', () => {
  const key = 'ack-deck.weather-city.v1';
  const env = setupModules([['ack-deck.tasks.v1', 'existing']], { events: [] });
  const info = env.load('footerInfo');
  assert.equal(info.loadWeatherCity(), 'Ankara');
  assert.equal(info.saveWeatherCity(' İstanbul '), true);
  assert.equal(info.loadWeatherCity(), 'İstanbul');
  assert.equal(env.values.get('ack-deck.tasks.v1'), 'existing');
  assert.equal(info.saveWeatherCity(''), false);
  assert.equal(info.saveWeatherCity('x'.repeat(81)), false);
  env.values.set(key, '{damaged');
  assert.equal(info.saveWeatherCity('İzmir'), false);
  assert.equal(env.values.get(key), '{damaged');
});

test('weather city reports quota failures and weather codes are honest', () => {
  const info = setupModules([], { failWrite: () => true }).load('footerInfo');
  assert.equal(info.saveWeatherCity('Ankara'), false);
  assert.equal(info.weatherDescription(0), 'Açık');
  assert.equal(info.weatherDescription(63), 'Yağmurlu');
  assert.equal(info.weatherDescription(999), 'Durum alınamadı');
});
