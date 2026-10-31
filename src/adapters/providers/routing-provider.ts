/**
 * Routing Provider Port Interface
 * Governed by G-ROUTE, Acceptance Criteria AC-212-1, AC-212-2.
 */

import type { Coordinate, RouteMode, RouteResult } from './routing-types.js';

export interface RoutingProvider {
  route(
    origin: Coordinate,
    destination: Coordinate,
    mode?: RouteMode
  ): Promise<RouteResult>;
}
