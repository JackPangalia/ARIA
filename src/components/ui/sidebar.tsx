"use client";

import Link, { type LinkProps } from "next/link";
import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarLinkDefinition {
  label: string;
  href: string;
  icon: ReactNode;
}

interface SidebarContextValue {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(
  undefined,
);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context)
    throw new Error("useSidebar must be used within a SidebarProvider");
  return context;
}

export function SidebarProvider(props: {
  children: ReactNode;
  open?: boolean;
  setOpen?: Dispatch<SetStateAction<boolean>>;
  animate?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  return (
    <SidebarContext.Provider
      value={{
        open: props.open ?? internalOpen,
        setOpen: props.setOpen ?? setInternalOpen,
        animate: props.animate ?? true,
      }}
    >
      {props.children}
    </SidebarContext.Provider>
  );
}

export const Sidebar = SidebarProvider;

export function DesktopSidebar({
  className,
  children,
  collapsedWidth = 60,
  expandedWidth = 300,
  expandOnHover = true,
  visibilityClassName = "hidden md:flex",
  onMouseEnter,
  onMouseLeave,
  ...props
}: React.ComponentProps<typeof motion.div> & {
  collapsedWidth?: number;
  expandedWidth?: number;
  expandOnHover?: boolean;
  visibilityClassName?: string;
}) {
  const { open, setOpen, animate } = useSidebar();
  const reduceMotion = useReducedMotion();
  const width = open ? expandedWidth : collapsedWidth;

  return (
    <motion.div
      initial={false}
      className={cn(
        "h-full shrink-0 flex-col bg-neutral-100 px-4 py-4 dark:bg-neutral-800",
        visibilityClassName,
        className,
      )}
      animate={{ width, minWidth: width }}
      transition={
        animate && !reduceMotion
          ? { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
          : { duration: 0 }
      }
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        if (expandOnHover) setOpen(true);
      }}
      onMouseLeave={(event) => {
        onMouseLeave?.(event);
        if (expandOnHover) setOpen(false);
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MobileSidebar({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const { open, setOpen } = useSidebar();
  return (
    <>
      <div
        className="flex h-10 w-full items-center justify-end bg-neutral-100 px-4 py-4 md:hidden dark:bg-neutral-800"
        {...props}
      >
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5 text-neutral-800 dark:text-neutral-200" />
        </button>
      </div>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "-100%", opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className={cn(
              "fixed inset-0 z-[100] flex h-full w-full flex-col justify-between bg-white p-10 md:hidden dark:bg-neutral-900",
              className,
            )}
          >
            <button
              type="button"
              className="absolute right-10 top-10"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-5 w-5 text-neutral-800 dark:text-neutral-200" />
            </button>
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export function SidebarBody(props: React.ComponentProps<typeof motion.div>) {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...(props as React.ComponentProps<"div">)} />
    </>
  );
}

export function SidebarLink({
  link,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & {
  link: SidebarLinkDefinition;
  href?: LinkProps["href"];
}) {
  const { open, animate } = useSidebar();
  return (
    <Link
      href={props.href ?? link.href}
      className={cn(
        "group/sidebar flex items-center justify-start gap-2 py-2",
        className,
      )}
      {...props}
    >
      {link.icon}
      <motion.span
        initial={false}
        animate={{ opacity: animate ? (open ? 1 : 0) : 1 }}
        className={cn(
          "m-0 inline-block whitespace-pre p-0 text-sm text-neutral-700 transition duration-150 group-hover/sidebar:translate-x-1 dark:text-neutral-200",
          !open && animate && "pointer-events-none w-0 overflow-hidden",
        )}
      >
        {link.label}
      </motion.span>
    </Link>
  );
}
