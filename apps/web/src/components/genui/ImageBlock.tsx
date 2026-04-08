/**
 * ImageBlock — standalone responsive image.
 */
import { useState } from 'react';
import type { ImageNode } from '../../types/genui';

export function ImageBlock({ src, alt }: ImageNode) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="rounded-xl overflow-hidden bg-gray-100 animate-genui-card-in">
      {!loaded && <div className="w-full aspect-video bg-gray-200 animate-pulse" />}
      <img
        src={src}
        alt={alt || ''}
        className={`w-full h-auto ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        loading="lazy"
      />
    </div>
  );
}
