import { AppSidebar } from "@/components/ui/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import publicAPI from "@/services/api/publicApi";
import { useStore } from "@/stores/store";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";

// Phones only: opens the sort/category drawer (the sidebar is a fixed column from md up).
function FiltersButton() {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className="md:hidden flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm font-medium hover:bg-muted"
    >
      <SlidersHorizontal size={14} /> Filters
    </button>
  );
}

const PAGE_SIZE = 20;

interface Posts {
  id: string;
  title: string;
  description: string;
  base_price: number;
  main_image: string;
}

export default function Page() {
  const [orderBy, setOrderBy] = useState("Relevance");
  const { order, category, setCategory } = useStore();

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q")?.trim() ?? "";

  // Page resets to 1 whenever the search, category or sort changes.
  const filterKey = `${q}|${category}|${order}`;
  const [paging, setPaging] = useState({ key: filterKey, page: 1 });
  const page = paging.key === filterKey ? paging.page : 1;
  const setPage = (next: (p: number) => number) => setPaging({ key: filterKey, page: next(page) });

  const { data: posts = [], refetch } = useQuery<Posts[]>({
    queryKey: ["posts", category, order, page, q],
    queryFn: async () => {
      if (q) {
        const response = await publicAPI.get("/products/search", {
          params: { q, sort: order.toLowerCase(), page },
        });
        return (response.data ?? []) as Posts[];
      }
      const response = await publicAPI.get("/products", {
        params: { sort: order, page: page, category: category || "all" },
      });
      const results: Posts[] =
        response.data?.results ?? response.data?.rows ?? [];
      return results;
    },
  });

  useEffect(() => {
    refetch();
  }, [category]);

  function onClickHandle(id: string) {
    navigate(`/product/${id}`)
  }

  return (
    <div className="flex flex-col min-h-svh">

      <SidebarProvider>
        <AppSidebar
          className="border-none"
          onOrderByChange={setOrderBy}
          onCategoryChange={setCategory}
        />
        <SidebarInset>
          <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <FiltersButton />
            <Breadcrumb className="min-w-0">
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block capitalize">
                  <BreadcrumbLink href="#">{q ? `Search: ${q}` : category ?? "All"}</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{orderBy}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex flex-1 flex-col gap-4 p-3 sm:p-4">
            <div
              className="cursor-pointer grid auto-rows-min gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(230px,1fr))]"
            >
              {posts?.length ? (
                posts.map((post: Posts) => (
                  <div
                    key={post.id}
                    onClick={() => onClickHandle(post.id)}
                    className="h-[250px] sm:h-[300px] w-full min-w-0 rounded-xl bg-muted/50 flex flex-col justify-center p-3 sm:p-4 global-card-hover overflow-hidden group"
                  >
                    <img
                      src={`${publicAPI.defaults.baseURL}/uploads?path=${encodeURIComponent(post.main_image)}`}
                      crossOrigin="anonymous"
                      alt={post.title}
                      className="h-[130px] sm:h-[165px] w-full object-cover rounded mb-2 transition-transform duration-300 group-hover:scale-105"
                    />
                    <span
                      className="capitalize text-[13px] sm:text-[14px]"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        wordBreak: "break-word",
                      }}
                    >
                      {post.title}
                    </span>
                    <span className="font-semibold mt-auto text-[15px] sm:text-[16px] self-start">
                      $ {post.base_price}
                    </span>
                  </div>
                ))
              ) : (
                <span className="text-muted-foreground">{q ? `No products found for "${q}".` : "No products found."}</span>
              )}
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                className="global-btn flex items-center gap-1 disabled:opacity-40"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                title="Previous page"
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <span className="text-sm text-muted-foreground">Page {page}</span>
              <button
                type="button"
                className="global-btn flex items-center gap-1 disabled:opacity-40"
                disabled={posts.length < PAGE_SIZE}
                onClick={() => setPage((p) => p + 1)}
                title="Next page"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}