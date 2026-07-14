import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { requireAdmin } from "@/lib/adminAuth";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    await connectDB();

    const product = await Product.findOne({ slug });
    if (!product) return NextResponse.json({ message: `Product not found: ${slug}` }, { status: 404 });
    return NextResponse.json(product, { headers: CACHE_HEADERS });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ message: "Error fetching product", error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // slug here is actually the MongoDB _id when called from admin
  const { error } = requireAdmin(req);
  if (error) return error;

  try {
    await connectDB();
    const updateData = await req.json();
    
    // Fetch original product to know if slug/category changes, so we can revalidate both old and new paths
    const original = await Product.findById(slug);

    const updated = await Product.findByIdAndUpdate(slug, { $set: updateData }, { new: true });
    if (!updated) return NextResponse.json({ message: "Product not found" }, { status: 404 });

    // Trigger Next.js cache revalidation for updated paths
    revalidatePath("/");
    revalidatePath("/products");
    if (updated.slug) revalidatePath(`/product/${updated.slug}`);
    if (updated.category) revalidatePath(`/category/${updated.category}`);

    // If slug or category changed, also revalidate the old paths
    if (original) {
      if (original.slug && original.slug !== updated.slug) {
        revalidatePath(`/product/${original.slug}`);
      }
      if (original.category && original.category !== updated.category) {
        revalidatePath(`/category/${original.category}`);
      }
    }

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ message: "Error updating product", error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { error } = requireAdmin(req);
  if (error) return error;

  try {
    await connectDB();
    const deleted = await Product.findByIdAndDelete(slug);
    if (!deleted) return NextResponse.json({ message: "Product not found" }, { status: 404 });

    // Trigger Next.js cache revalidation for deleted product paths
    revalidatePath("/");
    revalidatePath("/products");
    if (deleted.slug) revalidatePath(`/product/${deleted.slug}`);
    if (deleted.category) revalidatePath(`/category/${deleted.category}`);

    return NextResponse.json({ message: "Product deleted successfully" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ message: "Error deleting product", error: msg }, { status: 500 });
  }
}
