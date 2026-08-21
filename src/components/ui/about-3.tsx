import Image from "next/image";
import { ArrowDownRight } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface About3Props {
  title?: string;
  description?: string;
  mainImage?: {
    src: string;
    alt: string;
  };
  mainContent?: ReactNode;
  secondaryImage?: {
    src: string;
    alt: string;
  };
  secondaryContent?: ReactNode;
  layout?: "stacked" | "split";
  breakoutVisual?: ReactNode;
  breakoutContent?: ReactNode;
  breakout?: {
    src: string;
    alt: string;
    title?: string;
    description?: string;
    buttonText?: string;
    buttonUrl?: string;
  };
  companiesTitle?: string;
  companies?: Array<{
    src: string;
    alt: string;
  }>;
  achievementsTitle?: string;
  achievementsDescription?: string;
  achievements?: Array<{
    label: string;
    value: string;
  }>;
}

const defaultCompanies = [
  {
    src: "https://shadcnblocks.com/images/block/logos/company/fictional-company-logo-1.svg",
    alt: "Arc",
  },
  {
    src: "https://shadcnblocks.com/images/block/logos/company/fictional-company-logo-2.svg",
    alt: "Descript",
  },
  {
    src: "https://shadcnblocks.com/images/block/logos/company/fictional-company-logo-3.svg",
    alt: "Mercury",
  },
  {
    src: "https://shadcnblocks.com/images/block/logos/company/fictional-company-logo-4.svg",
    alt: "Ramp",
  },
  {
    src: "https://shadcnblocks.com/images/block/logos/company/fictional-company-logo-5.svg",
    alt: "Retool",
  },
  {
    src: "https://shadcnblocks.com/images/block/logos/company/fictional-company-logo-6.svg",
    alt: "Watershed",
  },
];

const defaultAchievements = [
  { label: "Companies Supported", value: "300+" },
  { label: "Projects Finalized", value: "800+" },
  { label: "Happy Customers", value: "99%" },
  { label: "Recognized Awards", value: "10+" },
];

export const About3 = ({
  title = "About Us",
  description =
    "A focused team creating tools that make complex work feel natural.",
  mainImage = {
    src: "/landing/kivo-room-listening.png",
    alt: "People in conversation around a table",
  },
  mainContent,
  secondaryImage = {
    src: "/landing/app-transcript.png",
    alt: "A live meeting transcript",
  },
  secondaryContent,
  layout = "stacked",
  breakoutVisual,
  breakoutContent,
  breakout = {
    src: "",
    alt: "",
    title: "Built for the room",
    description: "Technology that stays with the conversation.",
    buttonText: "Discover more",
    buttonUrl: "#how",
  },
  companiesTitle = "Valued by clients worldwide",
  companies = defaultCompanies,
  achievementsTitle = "Our Achievements in Numbers",
  achievementsDescription =
    "Providing effective tools that improve workflows and encourage growth.",
  achievements = defaultAchievements,
}: About3Props = {}) => {
  const isExternalLink = breakout.buttonUrl?.startsWith("http") ?? false;

  return (
    <section className="bg-[var(--lp-bg)] py-[clamp(5rem,10vw,8rem)]">
      <div className="mx-auto w-full max-w-[80rem] px-[var(--lp-gutter)]">
        <div className="mb-14 grid items-end gap-6 text-left md:grid-cols-[1.2fr_0.8fr] md:gap-12">
          <h2 className="m-0 max-w-[9.5em] text-[clamp(3.15rem,7.2vw,5.5rem)] font-medium leading-[1.02] tracking-[-0.04em] text-zinc-900 [text-wrap:balance]">
            {title}
          </h2>
          <p className="m-0 max-w-[34rem] text-[1.0625rem] leading-[1.55] text-zinc-700">
            {description}
          </p>
        </div>

        <div
          className={`grid gap-4 ${
            layout === "split"
              ? "lg:grid-cols-2"
              : "lg:grid-cols-[1.65fr_0.9fr]"
          }`}
        >
          <div className="relative min-h-[30rem] overflow-hidden rounded-3xl bg-zinc-200 lg:min-h-[42rem]">
            {mainContent ?? (
              <Image
                src={mainImage.src}
                alt={mainImage.alt}
                fill
                sizes="(max-width: 1023px) calc(100vw - 2.5rem), 780px"
                className="absolute inset-0 size-full object-cover"
              />
            )}
          </div>

          <div
            className={
              layout === "split"
                ? "min-h-[30rem] lg:min-h-[42rem]"
                : "grid gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:grid-rows-[0.9fr_1.1fr]"
            }
          >
            <div
              className={`flex flex-col justify-between rounded-3xl bg-zinc-900 p-7 text-zinc-50 lg:p-8 ${
                layout === "split" ? "h-full" : "min-h-[20rem] lg:min-h-0"
              }`}
            >
              {breakoutContent ?? (
                <>
                  <div className="flex items-start justify-between gap-4">
                    {breakout.src ? (
                      // Remote logo sources are supported by the reusable block.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={breakout.src}
                        alt={breakout.alt}
                        className="h-10 w-auto object-contain"
                      />
                    ) : (
                      <span className="pl-[0.42em] text-xs font-semibold uppercase tracking-[0.42em]">
                        Kivo
                      </span>
                    )}
                    <ArrowDownRight aria-hidden size={24} strokeWidth={1.5} />
                  </div>

                  {breakoutVisual ? (
                    <div className="my-auto py-7">{breakoutVisual}</div>
                  ) : null}

                  <div>
                    <p className="mb-3 text-2xl font-medium leading-tight tracking-[-0.035em]">
                      {breakout.title}
                    </p>
                    <p className="m-0 max-w-[28rem] text-sm leading-relaxed text-zinc-300">
                      {breakout.description}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    className="mr-auto rounded-full border-zinc-600 bg-transparent px-5 text-zinc-50 hover:bg-zinc-50 hover:text-zinc-900"
                    asChild
                  >
                    <a
                      href={breakout.buttonUrl}
                      target={isExternalLink ? "_blank" : undefined}
                      rel={isExternalLink ? "noreferrer" : undefined}
                    >
                      {breakout.buttonText}
                    </a>
                  </Button>
                </>
              )}
            </div>

            {layout === "stacked" ? (
              <div className="relative min-h-[20rem] overflow-hidden rounded-3xl bg-zinc-200 lg:min-h-0">
                {secondaryContent ?? (
                  <Image
                    src={secondaryImage.src}
                    alt={secondaryImage.alt}
                    fill
                    sizes="(max-width: 639px) calc(100vw - 2.5rem), (max-width: 1023px) 50vw, 440px"
                    className="absolute inset-0 size-full object-cover object-top"
                  />
                )}
              </div>
            ) : null}
          </div>
        </div>

        {companies.length > 0 ? (
          <div className="py-28">
            <p className="text-center text-sm text-zinc-600">
              {companiesTitle}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-8">
              {companies.map((company, index) => (
                <div
                  className="flex items-center gap-3"
                  key={company.src + index}
                >
                  {/* Company logos may be remote SVGs supplied by consumers. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={company.src}
                    alt={company.alt}
                    className="h-6 w-auto md:h-8"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {achievements.length > 0 ? (
          <div className="relative overflow-hidden rounded-3xl bg-zinc-100 p-10 md:p-16">
            <div className="flex flex-col gap-4 text-center md:text-left">
              <h2 className="text-4xl font-semibold">
                {achievementsTitle}
              </h2>
              <p className="max-w-screen-sm text-zinc-600">
                {achievementsDescription}
              </p>
            </div>
            <div className="mt-10 flex flex-wrap justify-between gap-10 text-center">
              {achievements.map((item, index) => (
                <div
                  className="flex flex-col gap-4"
                  key={item.label + index}
                >
                  <p>{item.label}</p>
                  <span className="text-4xl font-semibold md:text-5xl">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};
