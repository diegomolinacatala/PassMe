"use client";

import { useMemo, useReducer } from "react";
import type { DesignFields } from "@/lib/card/design";
import type { LinkKind } from "@/lib/card/links";
import { MAX_LINKS, parseCardInput, type FieldErrors } from "@/lib/card/schema";
import type { CardLink, OwnerCard, PublicCard } from "@/lib/card/types";

export interface CardDraft {
  slug: string;
  fullName: string;
  headline: string;
  company: string;
  location: string;
  pronouns: string;
  bio: string;
  accentColor: string;
  detailColor: string | null;
  pattern: DesignFields["pattern"];
  patternSeed: number;
  typeface: DesignFields["typeface"];
  avatarPath: string | null;
  avatarUrl: string | null;
  isPublished: boolean;
  acceptsContactRequests: boolean;
  links: CardLink[];
}

export type TextField = "slug" | "fullName" | "headline" | "company" | "location" | "pronouns" | "bio";

export function draftFromCard(card: OwnerCard): CardDraft {
  return {
    slug: card.slug,
    fullName: card.fullName,
    headline: card.headline,
    company: card.company,
    location: card.location,
    pronouns: card.pronouns,
    bio: card.bio,
    accentColor: card.accentColor,
    detailColor: card.detailColor,
    pattern: card.pattern,
    patternSeed: card.patternSeed,
    typeface: card.typeface,
    avatarPath: card.avatarPath,
    avatarUrl: card.avatarUrl,
    isPublished: card.isPublished,
    acceptsContactRequests: card.acceptsContactRequests,
    links: card.links,
  };
}

/** Payload for saveCardAction (avatarUrl is derived server-side). */
export function draftToInput(draft: CardDraft) {
  return {
    slug: draft.slug,
    fullName: draft.fullName,
    headline: draft.headline,
    company: draft.company,
    location: draft.location,
    pronouns: draft.pronouns,
    bio: draft.bio,
    accentColor: draft.accentColor,
    detailColor: draft.detailColor,
    pattern: draft.pattern,
    patternSeed: draft.patternSeed,
    typeface: draft.typeface,
    avatarPath: draft.avatarPath,
    isPublished: draft.isPublished,
    acceptsContactRequests: draft.acceptsContactRequests,
    links: draft.links,
  };
}

export function draftToPublicCard(draft: CardDraft): PublicCard {
  return {
    slug: draft.slug,
    fullName: draft.fullName.trim(),
    headline: draft.headline.trim(),
    company: draft.company.trim(),
    location: draft.location.trim(),
    pronouns: draft.pronouns.trim(),
    bio: draft.bio.trim(),
    accentColor: draft.accentColor,
    detailColor: draft.detailColor,
    pattern: draft.pattern,
    patternSeed: draft.patternSeed,
    typeface: draft.typeface,
    avatarUrl: draft.avatarUrl,
    links: draft.links.filter((l) => l.visible && l.value.trim()),
    acceptsContactRequests: draft.acceptsContactRequests,
  };
}

function newLinkId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `l-${random}`;
}

type Action =
  | { type: "field"; field: TextField; value: string }
  | { type: "design"; patch: Partial<DesignFields> }
  | { type: "published"; value: boolean }
  | { type: "contactRequests"; value: boolean }
  | { type: "avatar"; path: string | null; url: string | null }
  | { type: "addLink"; kind: LinkKind; id: string }
  | { type: "updateLink"; id: string; patch: Partial<Omit<CardLink, "id">> }
  | { type: "removeLink"; id: string }
  | { type: "moveLink"; id: string; direction: -1 | 1 }
  | { type: "reset"; draft: CardDraft };

interface State {
  draft: CardDraft;
  saved: CardDraft;
}

function reducer(state: State, action: Action): State {
  const { draft } = state;
  switch (action.type) {
    case "field":
      return { ...state, draft: { ...draft, [action.field]: action.value } };
    case "design":
      return { ...state, draft: { ...draft, ...action.patch } };
    case "published":
      return { ...state, draft: { ...draft, isPublished: action.value } };
    case "contactRequests":
      return { ...state, draft: { ...draft, acceptsContactRequests: action.value } };
    case "avatar":
      return { ...state, draft: { ...draft, avatarPath: action.path, avatarUrl: action.url } };
    case "addLink":
      if (draft.links.length >= MAX_LINKS) return state;
      return {
        ...state,
        draft: { ...draft, links: [...draft.links, { id: action.id, kind: action.kind, value: "", visible: true }] },
      };
    case "updateLink":
      return {
        ...state,
        draft: { ...draft, links: draft.links.map((l) => (l.id === action.id ? { ...l, ...action.patch } : l)) },
      };
    case "removeLink":
      return { ...state, draft: { ...draft, links: draft.links.filter((l) => l.id !== action.id) } };
    case "moveLink": {
      const index = draft.links.findIndex((l) => l.id === action.id);
      const target = index + action.direction;
      if (index < 0 || target < 0 || target >= draft.links.length) return state;
      const links = [...draft.links];
      [links[index], links[target]] = [links[target]!, links[index]!];
      return { ...state, draft: { ...draft, links } };
    }
    case "reset":
      return { draft: action.draft, saved: action.draft };
  }
}

export function useCardDraft(initial: CardDraft) {
  const [state, dispatch] = useReducer(reducer, { draft: initial, saved: initial });

  const errors: FieldErrors = useMemo(() => {
    const result = parseCardInput(draftToInput(state.draft));
    return result.ok ? {} : result.errors;
  }, [state.draft]);

  const dirty = useMemo(() => JSON.stringify(state.draft) !== JSON.stringify(state.saved), [state.draft, state.saved]);

  const actions = useMemo(
    () => ({
      setField: (field: TextField, value: string) => dispatch({ type: "field", field, value }),
      setDesign: (patch: Partial<DesignFields>) => dispatch({ type: "design", patch }),
      setPublished: (value: boolean) => dispatch({ type: "published", value }),
      setAcceptsContactRequests: (value: boolean) => dispatch({ type: "contactRequests", value }),
      setAvatar: (path: string | null, url: string | null) => dispatch({ type: "avatar", path, url }),
      addLink: (kind: LinkKind) => {
        const id = newLinkId();
        dispatch({ type: "addLink", kind, id });
        return id;
      },
      updateLink: (id: string, patch: Partial<Omit<CardLink, "id">>) => dispatch({ type: "updateLink", id, patch }),
      removeLink: (id: string) => dispatch({ type: "removeLink", id }),
      moveLink: (id: string, direction: -1 | 1) => dispatch({ type: "moveLink", id, direction }),
      markSaved: (draft: CardDraft) => dispatch({ type: "reset", draft }),
    }),
    [],
  );

  return { draft: state.draft, errors, dirty, ...actions };
}
