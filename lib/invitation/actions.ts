"use server";

import { createClient } from "@/lib/supabase/server";
import { mergeConfig } from "./mergeConfig";
import { deriveInvitationData, parseEventDate } from "./derive";
import type { StyleAnswers, UserData } from "./types";

export async function saveInvitation(userData: UserData, answers: StyleAnswers) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return { ok: false as const, error: "not_authenticated" as const };
  }

  const config = mergeConfig(answers);
  const bound = deriveInvitationData(userData, answers.tone);
  const eventDate = parseEventDate(userData.dateInput, userData.timeInput);
  const slug = `${bound.slug}-${Math.random().toString(36).slice(2, 7)}`;

  const { data, error } = await supabase
    .from("invitations")
    .insert({
      slug,
      owner_id: auth.user.id,
      groom_name: userData.groom,
      bride_name: userData.bride,
      event_at: (eventDate ?? new Date()).toISOString(),
      venue_name: userData.venue,
      venue_address: userData.address,
      family: {
        groomFather: userData.groomFather,
        groomMother: userData.groomMother,
        brideFather: userData.brideFather,
        brideMother: userData.brideMother,
      },
      style_answers: answers,
      config,
      greeting: config.greeting,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const, id: data.id as string, slug };
}

export async function updateInvitation(id: string, userData: UserData, answers: StyleAnswers) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return { ok: false as const, error: "not_authenticated" as const };
  }

  const config = mergeConfig(answers);
  const eventDate = parseEventDate(userData.dateInput, userData.timeInput);

  const { error } = await supabase
    .from("invitations")
    .update({
      groom_name: userData.groom,
      bride_name: userData.bride,
      event_at: (eventDate ?? new Date()).toISOString(),
      venue_name: userData.venue,
      venue_address: userData.address,
      family: {
        groomFather: userData.groomFather,
        groomMother: userData.groomMother,
        brideFather: userData.brideFather,
        brideMother: userData.brideMother,
      },
      style_answers: answers,
      config,
      greeting: config.greeting,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", auth.user.id);

  if (error) {
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const };
}
