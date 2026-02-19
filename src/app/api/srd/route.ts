import { NextRequest, NextResponse } from "next/server";
import {
  getAllSRDClasses,
  getAllSRDRaces,
  getSRDClassLevel,
} from "../../lib/characterStore";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type");

  try {
    if (type === "classes") {
      const classes = await getAllSRDClasses();
      return NextResponse.json(classes);
    }

    if (type === "races") {
      const races = await getAllSRDRaces();
      return NextResponse.json(races);
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
      return NextResponse.json(data);
    }

    return NextResponse.json(
      { error: "type must be classes, races, or class-level" },
      { status: 400 },
    );
  } catch (err) {
    console.error("[/api/srd] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
