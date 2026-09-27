import { describe, expect, it } from "vitest";
import {
  buildCustomerImportPreview,
  parseDelimitedText,
  suggestCustomerImportMapping,
  toImportedTable,
} from "./customer-import";

describe("customer import", () => {
  it("leser semikolonseparert CSV med anførselstegn uten å blande felter", () => {
    const table = toImportedTable(
      'Navn;E-post;Adresse\n"Nord AS";hei@nord.no;"Storgata 1; inngang B"',
    );
    expect(table.headers).toEqual(["Navn", "E-post", "Adresse"]);
    expect(table.rows[0]).toEqual(["Nord AS", "hei@nord.no", "Storgata 1; inngang B"]);
  });

  it("oppdager vanlige norske kolonner og bygger en kontrollert forhåndsvisning", () => {
    const headers = ["Firmanavn", "Org.nr", "Kontaktperson", "Telefon", "Poststed"];
    const mapping = suggestCustomerImportMapping(headers);
    const preview = buildCustomerImportPreview(
      [["Eksempel AS", "974761076", "Kari Nordmann", "912 34 567", "Oslo"]],
      mapping,
    );
    expect(preview.issues).toEqual([]);
    expect(preview.rows).toEqual([
      {
        name: "Eksempel AS",
        org_number: "974761076",
        contact_name: "Kari Nordmann",
        email: null,
        phone: "912 34 567",
        address: null,
        postal_code: null,
        city: "Oslo",
        customer_since: null,
      },
    ]);
  });

  it("avviser ugyldige rader og duplikater i samme fil", () => {
    const mapping = suggestCustomerImportMapping(["Navn", "Org.nr"]);
    const preview = buildCustomerImportPreview(
      [
        ["Første AS", "974761076"],
        ["Andre AS", "974761076"],
        ["", ""],
      ],
      mapping,
    );
    expect(preview.rows).toHaveLength(1);
    expect(preview.issues.map((issue) => issue.row)).toEqual([3, 4]);
  });

  it("leser tabulatorseparert eksport", () => {
    expect(parseDelimitedText("Navn\tE-post\nNord AS\thei@nord.no")).toEqual([
      ["Navn", "E-post"],
      ["Nord AS", "hei@nord.no"],
    ]);
  });
});
