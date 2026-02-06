import sys

try:
    from lxml import etree
except Exception as exc:
    sys.stderr.write(f"Missing dependencies: {exc}\n")
    sys.exit(1)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")

    if len(sys.argv) < 2:
        sys.stderr.write("Usage: omml2mathml.py <xsl_path>\n")
        sys.exit(1)

    xsl_path = sys.argv[1]
    omml_xml = sys.stdin.read()
    if not omml_xml.strip():
        print("")
        return

    try:
        xsl_doc = etree.parse(xsl_path)
        transform = etree.XSLT(xsl_doc)
        omml_doc = etree.fromstring(omml_xml.encode("utf-8"))
        result = transform(omml_doc)
        sys.stdout.write(str(result))
    except Exception as exc:
        sys.stderr.write(f"OMML transform failed: {exc}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
