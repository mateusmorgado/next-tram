import type { Stop } from '../../transit/index.ts';
import { client } from '../config.ts';
import { stripUndefined } from '../data.ts';
import { $ } from '../dom.ts';
import { form } from './form.ts';
import { syncSetupForm } from './sheet.ts';
import { CITIES } from '../../data/stops.ts';
import { t } from '../../i18n/index.ts';

export function useGps(): void {
  const btn = $<HTMLButtonElement>('gpsBtn');
  const label = btn.querySelector('span') as HTMLElement;
  const done = () => {
    label.textContent = t('setup.gps');
    btn.disabled = false;
  };
  const fail = (msg: string) => {
    $('setupError').textContent = msg;
    $('setupError').hidden = false;
    done();
  };
  if (!window.isSecureContext) return fail(t('gps.needHttps'));
  if (!navigator.geolocation) return fail(t('gps.unavailable'));
  $('setupError').hidden = true;
  btn.disabled = true;
  label.textContent = t('gps.finding');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      label.textContent = t('gps.looking');
      try {
        const { latitude: lat, longitude: lon } = pos.coords;
        const near = await client.nearbyStops(form.draft.city, lat, lon);
        if (!near.length) return fail(t('gps.noneNear', { city: CITIES[form.draft.city]?.label || '' }));
        const walkMin = (m?: number) => Math.max(1, Math.round((m || 0) / 80)); // ~80 m per minute
        const asStop = (s: Stop): Stop => ({ name: s.name, ...stripUndefined({ tid: s.tid, hafasId: s.hafasId, lat: s.lat, lon: s.lon }) });
        form.draft.stops[0] = { stop: asStop(near[0]), walk: walkMin(near[0].distance) };
        // Only fill Stop 2 if the person already opened it.
        if (form.secondStop && near[1]) form.draft.stops[1] = { stop: asStop(near[1]), walk: walkMin(near[1].distance) };
        syncSetupForm();
        done();
      } catch (e) {
        fail(t('gps.lookupFailed', { reason: (e as Error).message }));
      }
    },
    (err) => {
      const why =
        err.code === 1
          ? t('gps.blocked')
          : err.code === 3
            ? t('gps.timeout')
            : t('gps.unknown');
      fail(why);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
  );
}
