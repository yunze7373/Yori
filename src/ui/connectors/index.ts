/**
 * Connectors Module Exports
 * Governed by ARCH-REV3-UI-CONNECTORS.
 */

export * from './types.js';
export { LocationConnectorPort, locationConnectorPort } from './ports/location-port.js';
export { CalendarConnectorPort, calendarConnectorPort } from './ports/calendar-port.js';
export { WeatherConnectorPort, weatherConnectorPort } from './ports/weather-port.js';
export { XMemoConnectorPort, xmemoConnectorPort } from './ports/xmemo-port.js';
export { NotificationsConnectorPort, notificationsConnectorPort } from './ports/notifications-port.js';
export { renderConnectorsView } from './connectors-view.js';

import { demoFlagsReady, isXmemoHidden } from '../demo-flags.js';
import type { ConnectorId, ConnectorStatus } from './types.js';
import { locationConnectorPort } from './ports/location-port.js';
import { calendarConnectorPort } from './ports/calendar-port.js';
import { weatherConnectorPort } from './ports/weather-port.js';
import { xmemoConnectorPort } from './ports/xmemo-port.js';
import { notificationsConnectorPort } from './ports/notifications-port.js';

export async function getAllConnectorsStatus(
  options: { live?: boolean } = {}
): Promise<Record<ConnectorId, ConnectorStatus>> {
  // DEMO-XMEMO-FREE: with the demo switch on, the XMemo connector is not asked (and not shown).
  const xmemoStatus = demoFlagsReady.then(() =>
    isXmemoHidden()
      ? ({ id: 'xmemo', state: 'unavailable', detail: '', source: 'demo', updatedAt: new Date().toISOString() } as ConnectorStatus)
      : xmemoConnectorPort.status()
  );
  const [location, calendar, weather, xmemo, notifications] = await Promise.all([
    locationConnectorPort.status(),
    calendarConnectorPort.status(),
    weatherConnectorPort.status({ live: options.live }),
    xmemoStatus,
    notificationsConnectorPort.status(),
  ]);

  return {
    location,
    calendar,
    weather,
    xmemo,
    notifications,
  };
}
