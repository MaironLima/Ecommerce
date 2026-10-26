import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import publicAPI from "@/services/api/publicApi";
import { useStore } from "@/stores/store";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

const defaultOrderBy = [
  { title: "Most Recent", url: "#" },
  { title: "Ascending price", url: "#" },
  { title: "Descending price", url: "#" },
];

const defaultCategory = { title: "All", url: "#" };

interface CategoryItem {
  title: string;
  url: string;
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onOrderByChange?: (title: string) => void;
  onCategoryChange?: (title: string) => void;
}

export function AppSidebar({
  onOrderByChange,
  onCategoryChange,
  ...props
}: AppSidebarProps) {
  const [activeOrderBy, setActiveOrderBy] = useState("Most Recent");
  const [activeCategory, setActiveCategory] = useState<string | null>("All");
  const { setCategory, setOrderBy } = useStore();
  // Phones get the filters in a slide-in drawer (opened from MainPage); desktop keeps the fixed column.
  const { isMobile, setOpenMobile } = useSidebar();

  const handleOrderByClick = (title: string) => {
    setActiveOrderBy(title);
    onOrderByChange?.(title);
    setOrderBy(title);
    setOpenMobile(false);
  };

  const handleCategoryClick = (title: string) => {
    setActiveCategory(title);
    onCategoryChange?.(title);
    setCategory(title);
    setOpenMobile(false);
  };

  const { data: categories = [] } = useQuery<CategoryItem[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const response = await publicAPI.get("/catalog/category");
      const results: { id: string; name: string }[] = response.data?.results ?? [];
      return results.map((cat) => ({
        title: cat.name,
        url: "#",
      }));
    },
  });

  const displayCategories = [defaultCategory, ...categories];

  return (
    <Sidebar collapsible={isMobile ? "offcanvas" : "none"} {...props} className="border-r border-b">
      <SidebarHeader />
      <SidebarContent >
        <SidebarGroup>
          <SidebarGroupLabel className="font-bold">Order by</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {defaultOrderBy.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    className="capitalize"
                    asChild
                    isActive={activeOrderBy === item.title}
                    onClick={() => handleOrderByClick(item.title)}
                  >
                    <a href={item.url} onClick={(e) => e.preventDefault()}>
                      {item.title}
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="font-bold">Categories</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {displayCategories.map((item: CategoryItem) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    className="capitalize"
                    asChild
                    isActive={activeCategory === item.title}
                    onClick={() => handleCategoryClick(item.title)}
                  >
                    <a href={item.url} onClick={(e) => e.preventDefault()}>
                      {item.title}
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
