/**
 * json-render component registry — maps catalog component names to React components.
 *
 * Components use useGenUIActions() context for play/queue — no emit wiring needed.
 */
import type { ComponentRenderProps } from "@json-render/react";
import type { ReactNode } from "react";
import { AlbumCard } from "../components/genui/AlbumCard";
import { AlbumDetail } from "../components/genui/AlbumDetail";
import { TrackCard } from "../components/genui/TrackCard";
import { TextBlock } from "../components/genui/TextBlock";
import { Stat } from "../components/genui/Stat";
import { BadgeGroup } from "../components/genui/BadgeGroup";
import { Divider } from "../components/genui/Divider";
import { Timeline } from "../components/genui/Timeline";

function p<T>(ctx: ComponentRenderProps<T>): T {
  return ctx.element.props as T;
}

export const registry: Record<string, (ctx: ComponentRenderProps<any>) => ReactNode> = {
  Section: (ctx: ComponentRenderProps<{ title?: string; subtitle?: string }>) => {
    const props = p(ctx);
    return (
      <div className="space-y-3 animate-genui-slide-in">
        {(props.title || props.subtitle) && (
          <div>
            {props.title && <h3 className="text-sm font-semibold text-gray-900">{props.title}</h3>}
            {props.subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{props.subtitle}</p>}
          </div>
        )}
        <div className="space-y-0">{ctx.children}</div>
      </div>
    );
  },

  TimelineEra: (ctx: ComponentRenderProps<{ year: string; label: string; description?: string }>) => {
    const props = p(ctx);
    return (
      <Timeline.Era year={props.year} label={props.label} description={props.description ?? undefined}>
        {ctx.children}
      </Timeline.Era>
    );
  },

  AlbumCard: (ctx: ComponentRenderProps<{ title: string; subtitle: string; trackId?: string; query?: string; year?: string }>) => {
    const props = p(ctx);
    return <AlbumCard title={props.title} subtitle={props.subtitle} trackId={props.trackId ?? undefined} query={props.query ?? undefined} year={props.year ?? undefined} />;
  },

  AlbumDetail: (ctx: ComponentRenderProps<{ title: string; subtitle: string; trackId?: string; query?: string; year?: string }>) => {
    const props = p(ctx);
    return <AlbumDetail title={props.title} subtitle={props.subtitle} query={props.query ?? undefined} year={props.year ?? undefined} />;
  },

  TrackCard: (ctx: ComponentRenderProps<{ title: string; artist: string; album?: string; query?: string }>) => {
    const props = p(ctx);
    return <TrackCard title={props.title} artist={props.artist} album={props.album ?? undefined} query={props.query ?? undefined} />;
  },

  TextBlock: (ctx: ComponentRenderProps<{ content: string; style?: string }>) => {
    const props = p(ctx);
    return <TextBlock content={props.content} style={(props.style ?? "body") as "heading" | "body" | "caption"} />;
  },

  Stat: (ctx: ComponentRenderProps<{ value: string; label: string }>) => {
    const props = p(ctx);
    return <Stat value={props.value} label={props.label} />;
  },

  BadgeGroup: (ctx: ComponentRenderProps<{ badges: { label: string; color?: string }[] }>) => {
    const props = p(ctx);
    return <BadgeGroup badges={props.badges} />;
  },

  Divider: () => <Divider />,
};
