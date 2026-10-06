"use client";

import { useMemo, useReducer } from "react";
import type { DesignFields } from "@/lib/card/design";
import type { LinkKind } from "@/lib/card/links";
import { MAX_LINKS, parseCardInput, type FieldErrors } from "@/lib/card/schema";
import type { CardLink, OwnerCard, PublicCard } from "@/lib/card/types";
import { moveItem } from "@/lib/reorder";

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
  acceptsMeetingRequests: boolean;
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
    acceptsMeetingRequests: card.acceptsMeetingRequests,
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
    acceptsMeetingRequests: draft.acceptsMeetingRequests,
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
    acceptsMeetingRequests: draft.acceptsMeetingRequests,
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
  | { type: "meetingRequests"; value: boolean }
  | { type: "avatar"; path: string | null; url: string | null }
  | { type: "addLink"; kind: LinkKind; id: string; value: string }
  | { type: "duplicateLink"; id: string; newId: string }
  | { type: "moveLinkTo"; id: string; index: number }
  | { type: "updateLink"; id: string; patch: Partial<Omit<CardLink, "id">> }
  | { type: "removeLink"; id: string }
  | { type: "restoreLink"; link: CardLink; index: number }
  | { type: "reset"; draft: CardDraft }
  // Back to the saved state ("Descartar"), or to a draft that was just discarded ("Deshacer").
  | { type: "discard" }
  | { type: "replace"; draft: CardDraft };

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
    case "meetingRequests":
      return { ...state, draft: { ...draft, acceptsMeetingRequests: action.value } };
    case "avatar":
      return { ...state, draft: { ...draft, avatarPath: action.path, avatarUrl: action.url } };
    case "addLink":
      if (draft.links.length >= MAX_LINKS) return state;
      return {
        ...state,
        draft: { ...draft, links: [...draft.links, { id: action.id, kind: action.kind, value: action.value, visible: true }] },
      };
    case "duplicateLink": {
      const index = draft.links.findIndex((l) => l.id === action.id);
      if (index < 0 || draft.links.length >= MAX_LINKS) return state;
      const links = [...draft.links];
      links.splice(index + 1, 0, { ...draft.links[index]!, id: action.newId });
      return { ...state, draft: { ...draft, links } };
    }
    case "moveLinkTo": {
      const index = draft.links.findIndex((l) => l.id === action.id);
      if (index < 0 || index === action.index) return state;
      return { ...state, draft: { ...draft, links: moveItem(draft.links, index, action.index) } };
    }
    case "updateLink":
      return {
        ...state,
        draft: { ...draft, links: draft.links.map((l) => (l.id === action.id ? { ...l, ...action.patch } : l)) },
      };
    case "removeLink":
      return { ...state, draft: { ...draft, links: draft.links.filter((l) => l.id !== action.id) } };
    case "restoreLink": {
      if (draft.links.length >= MAX_LINKS || draft.links.some((l) => l.id === action.link.id)) return state;
      const links = [...draft.links];
      links.splice(Math.min(Math.max(action.index, 0), links.length), 0, action.link);
      return { ...state, draft: { ...draft, links } };
    }
    case "reset":
      return { draft: action.draft, saved: action.draft };
    case "discard":
      return { ...state, draft: state.saved };
    case "replace":
      return { ...state, draft: action.draft };
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
      setAcceptsMeetingRequests: (value: boolean) => dispatch({ type: "meetingRequests", value }),
      setAvatar: (path: string | null, url: string | null) => dispatch({ type: "avatar", path, url }),
      addLink: (kind: LinkKind, value = "") => {
        const id = newLinkId();
        dispatch({ type: "addLink", kind, id, value });
        return id;
      },
      duplicateLink: (id: string) => {
        const newId = newLinkId();
        dispatch({ type: "duplicateLink", id, newId });
        return newId;
      },
      moveLinkTo: (id: string, index: number) => dispatch({ type: "moveLinkTo", id, index }),
      updateLink: (id: string, patch: Partial<Omit<CardLink, "id">>) => dispatch({ type: "updateLink", id, patch }),
      removeLink: (id: string) => dispatch({ type: "removeLink", id }),
      restoreLink: (link: CardLink, index: number) => dispatch({ type: "restoreLink", link, index }),
      markSaved: (draft: CardDraft) => dispatch({ type: "reset", draft }),
      discard: () => dispatch({ type: "discard" }),
      replaceDraft: (draft: CardDraft) => dispatch({ type: "replace", draft }),
    }),
    [],
  );

  return { draft: state.draft, errors, dirty, ...actions };
}
