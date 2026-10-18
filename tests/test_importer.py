import importlib.util
import tempfile
from pathlib import Path
import unittest
import pymupdf

spec = importlib.util.spec_from_file_location("import_bills", Path(__file__).resolve().parent.parent / "scripts/import_bills.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ImportTests(unittest.TestCase):
    def test_xfinity_uses_new_charges_not_provider_payment(self):
        text = "Xfinity\nServices From\nAug 01, 2026 to Aug 31, 2026\nOne-time EFT Payment\n-$25.00\nRegular monthly charges\n$50.00\nTaxes, fees and other charges\n$0.94\nNew charges due Aug 15, 2026\n$50.94\nAmount due\n$25.94"
        result = module.parse_text(text, "a"*64)
        self.assertEqual(result["bill"]["charges"][0]["amount_cents"],5094)
        self.assertNotIn("25.00",str(result))
        with self.assertRaises(ValueError):
            module.parse_text(text.replace("$50.94","$60.94"),"a"*64)

    def test_invalid_or_ambiguous_statements_stop(self):
        for text in ["Scanned", "Eversource\nElectric Account Summary\nService from 08/21/26 - 09/17/26 27 Days\n$94.98\nTotal Current Charges"]:
            with self.assertRaises(ValueError): module.parse_text(text,"b"*64)

    def test_organization_preserves_files_and_does_not_overwrite_duplicates(self):
        old_root=module.ROOT
        with tempfile.TemporaryDirectory() as tmp:
            module.ROOT=Path(tmp)
            try:
                record={"provider":"eversource","bill":{"utility":"gas","start_date":"2026-08-21","end_date":"2026-09-17","source_hash":"a"*64,"charges":[{"amount_cents":4821}]}}
                source=Path(tmp)/"bill.pdf";source.write_bytes(b"original")
                target=module.archive(source,record)
                self.assertEqual(target.read_bytes(),b"original")
                self.assertTrue(str(target.relative_to(tmp)).startswith("bills/2026/gas/2026-08-21_to_2026-09-17_eversource_gas_48.21_"))
                source.write_bytes(b"second copy")
                second=module.archive(source,record)
                self.assertNotEqual(target,second)
                self.assertEqual(target.read_bytes(),b"original")
                self.assertEqual(second.read_bytes(),b"second copy")
            finally: module.ROOT=old_root

    def test_actual_private_pdfs_when_available(self):
        paths=list(module.ROOT.glob("*.pdf"))+list((module.ROOT/"bills").rglob("*.pdf"))
        if not paths: self.skipTest("Private bills intentionally excluded from repository")
        records=[module.read_pdf(p) for p in paths]
        expected={"gas":4821,"electricity":9498,"wifi":5094}
        initial=[r for r in records if r['bill']['start_date'] in ('2026-08-01','2026-09-01','2026-10-01','2026-08-21')]
        for r in initial:
            self.assertEqual(sum(c["amount_cents"] for c in r["bill"]["charges"]),expected[r["bill"]["utility"]])
        earlier=module.initial_august_bills(initial)
        self.assertEqual(sum(c['charges'][0]['amount_cents'] for c in earlier),13152)
        self.assertEqual(len(earlier),2)
        for b in earlier:
            self.assertEqual((b['start_date'],b['end_date']),('2026-08-01','2026-08-20'))
            self.assertIsNone(b['opening_before'])
            self.assertEqual(b['charges'][0]['kind'],'recurring')

if __name__ == '__main__': unittest.main()
