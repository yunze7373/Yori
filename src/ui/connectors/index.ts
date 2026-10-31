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

import type { ConnectorId, ConnectorStatus } from './types.js';
import { locationConnectorPort } from './ports/location-port.js';
import { calendarConnectorPort } from './ports/calendar-port.js';
import { weatherConnectorPort } from './ports/weather-port.js';
import { xmemoConnectorPort } from './ports/xmemo-port.js';
import { notificationsConnectorPort } from './ports/notifications-port.js';

export async function getAllConnectorsStatus(): Promise<Record<ConnectorId, ConnectorStatus>> {
  const [location, calendar, weather, xmemo, notifications] = await Promise.all([
    locationConnectorPort.status(),
    calendarConnectorPort.status(),
    weatherConnectorPort.status(),
    xmemoConnectorPort.status(),
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
