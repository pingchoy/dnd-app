import { NextRequest, NextResponse } from "next/server";
import {
  getAllSRDClasses,
  getAllSRDRaces,
  getAllSRDFeats,
  getSRDClassLevel,
  getSRDSubclassLevel,
  getSRDSpellsByClassAndLevel,
  getSRDStartingEquipment,
  querySRD,
} from "../../lib/characterStore";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type");

  // SRD data is static — safe to cache for 1 hour in the browser and CDN.
  const srdHeaders = { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" };

  try {
    if (type === "classes") {
      const classes = await getAllSRDClasses();
      return NextResponse.json(classes, { headers: srdHeaders });
    }

    if (type === "races") {
      const races = await getAllSRDRaces();
      return NextResponse.json(races, { headers: srdHeaders });
    }

    if (type === "class-level") {
      const classSlug = searchParams.get("classSlug");
      const levelParam = searchParams.get("level");

      if (!classSlug || !levelParam) {
        return NextResponse.json(
          { error: "classSlug and level are required for type=class-level" },
          { status: 400 },
        );
      }

      const level = parseInt(levelParam, 10);
      if (isNaN(level)) {
        return NextResponse.json({ error: "level must be a number" }, { status: 400 });
      }

      const data = await getSRDClassLevel(classSlug, level);
      if (!data) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(data, { headers: srdHeaders });
    }

    if (type === "spell") {
      const slug = searchParams.get("slug");
      if (!slug) {
        return NextResponse.json(
          { error: "slug is required for type=spell" },
          { status: 400 },
        );
      }
      const data = await querySRD("spell", slug);
      if (!data) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(data, { headers: srdHeaders });
    }

    if (type === "spell-list") {
      const classSlug = searchParams.get("classSlug");
      if (!classSlug) {
        return NextResponse.json(
          { error: "classSlug is required for type=spell-list" },
          { status: 400 },
        );
      }
      const data = await querySRD("spell_list", classSlug);
      if (!data) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(data, { headers: srdHeaders });
    }

    if (type === "class-spells") {
      const classSlug = searchParams.get("classSlug");
      const levelParam = searchParams.get("level");

      if (!classSlug || levelParam == null) {
        return NextResponse.json(
          { error: "classSlug and level are required for type=class-spells" },
          { status: 400 },
        );
      }

      const spellLevel = parseInt(levelParam, 10);
      if (isNaN(spellLevel)) {
        return NextResponse.json({ error: "level must be a number" }, { status: 400 });
      }

      const spells = await getSRDSpellsByClassAndLevel(classSlug, spellLevel);
      return NextResponse.json(spells, { headers: srdHeaders });
    }

    if (type === "feats") {
      const feats = await getAllSRDFeats();
      return NextResponse.json(feats, { headers: srdHeaders });
    }

    if (type === "starting-equipment") {
      const slug = searchParams.get("classSlug");
      if (!slug) {
        return NextResponse.json(
          { error: "classSlug is required for type=starting-equipment" },
          { status: 400 },
        );
      }
      const data = await getSRDStartingEquipment(slug);
      if (!data) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(data, { headers: srdHeaders });
    }

    if (type === "subclass-level") {
      const subclassSlug = searchParams.get("subclassSlug");
      const levelParam = searchParams.get("level");

      if (!subclassSlug || !levelParam) {
        return NextResponse.json(
          { error: "subclassSlug and level are required for type=subclass-level" },
          { status: 400 },
        );
      }

      const level = parseInt(levelParam, 10);
      if (isNaN(level)) {
        return NextResponse.json({ error: "level must be a number" }, { status: 400 });
      }

      const data = await getSRDSubclassLevel(subclassSlug, level);
      if (!data) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(data, { headers: srdHeaders });
    }

    return NextResponse.json(
      { error: "type must be classes, races, class-level, spell, spell-list, class-spells, feats, subclass-level, or starting-equipment" },
      { status: 400 },
    );
  } catch (err) {
    console.error("[/api/srd] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
