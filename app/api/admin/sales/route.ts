import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing admin session.");
  }

  const token = authorization.slice("Bearer ".length);
  const supabase = createAdminClient();

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    throw new Error("Your admin session is invalid or expired.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "admin") {
    throw new Error("Administrator access is required.");
  }

  return supabase;
}

type OrderRow = {
  id: string;
  total: number | string;
  currency: string | null;
  payment_status: string;
  beat_ids: string[] | null;
  site_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  created_at: string;
};

type ItemRow = {
  order_id: string;
  beat_id: string | null;
  beat_title: string;
  catalog_code: string | null;
  unit_price: number | string;
  quantity: number;
  currency: string;
};

export async function GET(request: Request) {
  try {
    const supabase = await requireAdmin(request);
    const url = new URL(request.url);
    const siteId = url.searchParams.get("site_id");

    if (!siteId) {
      return NextResponse.json(
        { error: "Choose a storefront first." },
        { status: 400 }
      );
    }

    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("id,name")
      .eq("id", siteId)
      .maybeSingle();

    if (siteError) throw siteError;
    if (!site) {
      return NextResponse.json(
        { error: "Storefront not found." },
        { status: 404 }
      );
    }

    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select(
        "id,total,currency,payment_status,beat_ids,site_id,customer_email,customer_name,created_at"
      )
      .eq("site_id", siteId)
      .eq("payment_status", "completed")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (ordersError) throw ordersError;

    const orders = (ordersData || []) as OrderRow[];
    const orderIds = orders.map((order) => order.id);

    let items: ItemRow[] = [];

    if (orderIds.length) {
      const { data: itemsData, error: itemsError } = await supabase
        .from("order_items")
        .select(
          "order_id,beat_id,beat_title,catalog_code,unit_price,quantity,currency"
        )
        .in("order_id", orderIds);

      if (itemsError) {
        if (
          itemsError.message.toLowerCase().includes("order_items") ||
          itemsError.message.toLowerCase().includes("does not exist")
        ) {
          return NextResponse.json(
            {
              error:
                "Sales tracking setup is incomplete. Run supabase/sales-tracking.sql in Supabase first."
            },
            { status: 500 }
          );
        }

        throw itemsError;
      }

      items = (itemsData || []) as ItemRow[];
    }

    const itemOrderIds = new Set(items.map((item) => item.order_id));

    const legacyBeatIds = Array.from(
      new Set(
        orders
          .filter((order) => !itemOrderIds.has(order.id))
          .flatMap((order) => order.beat_ids || [])
      )
    );

    const beatLookup = new Map<
      string,
      { title: string; catalog_code: string | null }
    >();

    if (legacyBeatIds.length) {
      const { data: beatsData, error: beatsError } = await supabase
        .from("beats")
        .select("id,title,catalog_code")
        .in("id", legacyBeatIds);

      if (beatsError) throw beatsError;

      for (const beat of beatsData || []) {
        beatLookup.set(beat.id, {
          title: beat.title,
          catalog_code: beat.catalog_code || null
        });
      }
    }

    const byBeat = new Map<
      string,
      {
        beatId: string;
        title: string;
        catalogCode: string | null;
        units: number;
        revenue: number;
        legacyUnits: number;
      }
    >();

    const itemsByOrder = new Map<string, ItemRow[]>();

    for (const item of items) {
      const list = itemsByOrder.get(item.order_id) || [];
      list.push(item);
      itemsByOrder.set(item.order_id, list);

      const beatKey = item.beat_id || `${item.order_id}:${item.beat_title}`;
      const current = byBeat.get(beatKey) || {
        beatId: beatKey,
        title: item.beat_title,
        catalogCode: item.catalog_code,
        units: 0,
        revenue: 0,
        legacyUnits: 0
      };

      const quantity = Math.max(1, Number(item.quantity) || 1);
      current.units += quantity;
      current.revenue += Number(item.unit_price) * quantity;
      byBeat.set(beatKey, current);
    }

    let legacyMultiBeatOrders = 0;

    for (const order of orders) {
      if (itemOrderIds.has(order.id)) continue;

      const beatIds = order.beat_ids || [];
      if (beatIds.length > 1) legacyMultiBeatOrders += 1;

      for (const beatId of beatIds) {
        const beat = beatLookup.get(beatId);
        const current = byBeat.get(beatId) || {
          beatId,
          title: beat?.title || "Deleted beat",
          catalogCode: beat?.catalog_code || null,
          units: 0,
          revenue: 0,
          legacyUnits: 0
        };

        current.units += 1;
        current.legacyUnits += 1;

        // A legacy single-beat order can be attributed exactly because the
        // entire verified order total belongs to that one beat.
        if (beatIds.length === 1) {
          current.revenue += Number(order.total) || 0;
          current.legacyUnits -= 1;
        }

        byBeat.set(beatId, current);
      }
    }

    const grossSales = orders.reduce(
      (sum, order) => sum + (Number(order.total) || 0),
      0
    );
    const unitsSold = orders.reduce(
      (sum, order) => sum + (order.beat_ids?.length || 0),
      0
    );
    const currency =
      orders.find((order) => order.currency)?.currency || "USD";

    const recentOrders = orders.slice(0, 25).map((order) => {
      const orderItems = itemsByOrder.get(order.id) || [];
      const beats = orderItems.length
        ? orderItems.map((item) =>
            item.catalog_code
              ? `${item.catalog_code} — ${item.beat_title}`
              : item.beat_title
          )
        : (order.beat_ids || []).map((beatId) => {
            const beat = beatLookup.get(beatId);
            return beat?.catalog_code
              ? `${beat.catalog_code} — ${beat.title}`
              : beat?.title || "Deleted beat";
          });

      return {
        id: order.id,
        total: Number(order.total) || 0,
        currency: order.currency || currency,
        customerEmail: order.customer_email,
        customerName: order.customer_name,
        createdAt: order.created_at,
        beats
      };
    });

    return NextResponse.json({
      summary: {
        grossSales,
        completedOrders: orders.length,
        unitsSold,
        averageOrder: orders.length ? grossSales / orders.length : 0,
        currency
      },
      beats: Array.from(byBeat.values()).sort((a, b) => {
        if (b.units !== a.units) return b.units - a.units;
        return b.revenue - a.revenue;
      }),
      recentOrders,
      legacyMultiBeatOrders
    });
  } catch (error) {
    console.error("Admin sales error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load sales."
      },
      { status: 500 }
    );
  }
}
