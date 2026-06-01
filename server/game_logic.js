export function makeSegmentId(firstStationId, secondStationId) {
  const sortedIds = [firstStationId, secondStationId].sort((a, b) => a - b);
  return `${sortedIds[0]}-${sortedIds[1]}`;
}

export function buildSegments(lines) {
  const segmentMap = new Map();

  for (const line of lines) {
    for (let index = 0; index < line.stations.length - 1; index += 1) {
      const first = line.stations[index];
      const second = line.stations[index + 1];
      const id = makeSegmentId(first.id, second.id);

      if (!segmentMap.has(id)) {
        segmentMap.set(id, {
          id,
          stationAId: first.id,
          stationAName: first.name,
          stationBId: second.id,
          stationBName: second.name,
          lineIds: [],
          lineNames: [],
        });
      }

      const segment = segmentMap.get(id);
      segment.lineIds.push(line.id);
      segment.lineNames.push(line.name);
    }
  }

  return [...segmentMap.values()].sort((a, b) =>
    `${a.stationAName}-${a.stationBName}`.localeCompare(`${b.stationAName}-${b.stationBName}`),
  );
}

export function buildAdjacency(segments) {
  const adjacency = new Map();

  for (const segment of segments) {
    if (!adjacency.has(segment.stationAId)) {
      adjacency.set(segment.stationAId, []);
    }
    if (!adjacency.has(segment.stationBId)) {
      adjacency.set(segment.stationBId, []);
    }

    adjacency.get(segment.stationAId).push(segment.stationBId);
    adjacency.get(segment.stationBId).push(segment.stationAId);
  }

  return adjacency;
}

export function shortestStopDistance(adjacency, startStationId, destinationStationId) {
  const queue = [{ stationId: startStationId, distance: 0 }];
  const visited = new Set([startStationId]);

  while (queue.length > 0) {
    const current = queue.shift();

    if (current.stationId === destinationStationId) {
      return current.distance;
    }

    for (const nextStationId of adjacency.get(current.stationId) ?? []) {
      if (!visited.has(nextStationId)) {
        visited.add(nextStationId);
        queue.push({ stationId: nextStationId, distance: current.distance + 1 });
      }
    }
  }

  return Number.POSITIVE_INFINITY;
}

export function findCandidateDestinations(stations, adjacency, startStationId, minimumStops) {
  return stations.filter((station) => {
    if (station.id === startStationId) {
      return false;
    }
    return shortestStopDistance(adjacency, startStationId, station.id) >= minimumStops;
  });
}

export function validateRoute({ segmentIds, game, segments, interchangeStationIds }) {
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const steps = [];
  let currentStationId = game.start_station_id;

  if (!Array.isArray(segmentIds) || segmentIds.length === 0) {
    return { valid: false, reason: "The submitted route is empty.", steps: [] };
  }

  for (const segmentId of segmentIds) {
    const segment = segmentById.get(segmentId);

    if (!segment) {
      return { valid: false, reason: "The route contains an unknown segment.", steps: [] };
    }

    if (segment.stationAId !== currentStationId && segment.stationBId !== currentStationId) {
      return { valid: false, reason: "The selected segments are not connected in sequence.", steps: [] };
    }

    const nextStationId =
      segment.stationAId === currentStationId ? segment.stationBId : segment.stationAId;

    steps.push({
      fromStationId: currentStationId,
      toStationId: nextStationId,
      lineIds: segment.lineIds,
    });
    currentStationId = nextStationId;
  }

  if (currentStationId !== game.destination_station_id) {
    return { valid: false, reason: "The route does not reach the assigned destination.", steps: [] };
  }

  let possibleCurrentLines = new Set(steps[0].lineIds);

  for (let index = 1; index < steps.length; index += 1) {
    const step = steps[index];
    const connectionStationId = step.fromStationId;
    const nextPossibleLines = new Set();

    for (const previousLineId of possibleCurrentLines) {
      for (const lineId of step.lineIds) {
        if (previousLineId === lineId || interchangeStationIds.has(connectionStationId)) {
          nextPossibleLines.add(lineId);
        }
      }
    }

    if (nextPossibleLines.size === 0) {
      return {
        valid: false,
        reason: "The route changes line at a station that is not an interchange.",
        steps: [],
      };
    }

    possibleCurrentLines = nextPossibleLines;
  }

  return { valid: true, reason: null, steps };
}
