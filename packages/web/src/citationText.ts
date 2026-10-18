import { formatCitation, type CitationStyle } from '@recordseek/core';
import type { Capture } from './capture/CaptureContext';

/** The captured page as a formatted website citation (same record JustCitation uses). */
export function captureCitation(capture: Capture, style: CitationStyle): string {
  return formatCitation(
    {
      sourceType: 'website',
      title: capture.title,
      publisher: capture.publisher,
      url: capture.url,
      accessedDate: capture.accessedDate,
    },
    style,
  );
}
