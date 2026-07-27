import { describe, expect, it } from "vitest";
import {
  calculateTotal,
  lineEffectivePrice,
  renderTemplateHtml,
  renderTemplateText,
  type TemplateLineItem,
} from "./templates";

const items: TemplateLineItem[] = [
  {
    name: "Grunnpakke",
    description: null,
    quantity: 2,
    unit_price: 1000,
    override_price: null,
    billing_interval: "month",
    binding_months: 12,
  },
  {
    name: "Tillegg",
    description: null,
    quantity: 1,
    unit_price: 500,
    override_price: 400,
    billing_interval: "once",
    binding_months: null,
  },
];

describe("lineEffectivePrice / calculateTotal", () => {
  it("bruker override_price når satt, ellers unit_price", () => {
    expect(lineEffectivePrice(items[0])).toBe(1000);
    expect(lineEffectivePrice(items[1])).toBe(400);
  });

  it("summerer antall × effektiv pris for alle linjer", () => {
    // 2*1000 + 1*400 = 2400
    expect(calculateTotal(items)).toBe(2400);
  });
});

describe("renderTemplateText", () => {
  it("erstatter plassholdere med verdier fra konteksten", () => {
    const out = renderTemplateText("Hei {{customer_name}}, org.nr {{org_number}}.", {
      customer_name: "Eksempel AS",
      org_number: "923609016",
      items: [],
    });
    expect(out).toBe("Hei Eksempel AS, org.nr 923 609 016.");
  });

  it("lar ukjente plassholdere stå urørt", () => {
    const out = renderTemplateText("Verdi: {{ukjent_felt}}", { customer_name: "X", items: [] });
    expect(out).toContain("{{ukjent_felt}}");
  });

  it("gjengir products_table som en ren tekstliste med totalsum", () => {
    const out = renderTemplateText("{{products_table}}", { customer_name: "X", items });
    expect(out).toContain("Grunnpakke");
    expect(out).toContain("Tillegg");
    expect(out).toContain("Totalt:");
  });
});

describe("renderTemplateHtml", () => {
  it("escaper farlig HTML i malteksten (ingen script-injeksjon)", () => {
    const out = renderTemplateHtml("<script>alert(1)</script> {{customer_name}}", {
      customer_name: "<b>Kunde</b>",
      items: [],
    });
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
    // customer_name skal også være escapet, ikke tolket som HTML.
    expect(out).toContain("&lt;b&gt;Kunde&lt;/b&gt;");
  });

  it("konverterer linjeskift til <br />", () => {
    const out = renderTemplateHtml("Linje 1\nLinje 2", { customer_name: "X", items: [] });
    expect(out).toContain("Linje 1<br />Linje 2");
  });

  it("setter inn en ekte HTML-tabell for products_table", () => {
    const out = renderTemplateHtml("{{products_table}}", { customer_name: "X", items });
    expect(out).toContain("<table");
    expect(out).toContain("Grunnpakke");
  });
});
