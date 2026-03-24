#!/bin/bash

echo "=== SCP API Status ==="
curl -s -H "Authorization: Bearer sk-b0eca789-0a05-4545-ac44-894e018d7503" https://scphub.intern-ai.org.cn/api/v1/tools | jq -r '.msg // "Success"'

echo ""
echo "=== Public APIs Test ==="

echo "1. PubChem API:"
curl -s "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/aspirin/property/MolecularFormula/JSON" | jq '.PropertyTable.Properties[0].MolecularFormula'

echo "2. ChEMBL API:"
curl -s "https://www.ebi.ac.uk/chembl/api/data/molecule/search.json?q=aspirin" | jq '.molecules[0].molecule_chembl_id'

echo "3. UniProt API:"
curl -s "https://rest.uniprot.org/uniprotkb/search?query=gene:TP53&format=json&size=1" | jq '.results[0].primaryAccession'

echo "4. NCBI API:"
curl -s "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=gene&term=TP53&retmode=json" | jq '.esearchresult.idlist[0]'

echo "5. Ensembl API:"
curl -s "https://rest.ensembl.org/lookup/symbol/homo_sapiens/TP53?content-type=application/json" | jq '.id'

echo "6. KEGG API:"
curl -s "http://rest.kegg.jp/find/hsa:7157" | head -1

echo "7. TCGA GDC API:"
curl -s "https://api.gdc.cancer.gov/projects?size=1" | jq '.data.hits[0].project_id'

echo "8. STRING DB API:"
curl -s "https://string-db.org/api/json/network?identifiers=TP53&species=9606" | jq 'length'

echo "9. Open Targets API:"
curl -s "https://api.genetics.opentargets.org/graphql" -H "Content-Type: application/json" -d '{"query":"{search(queryString:\"TP53\"){total}}"}' | jq '.data.search.total'

echo "10. Monarch API:"
curl -s "https://api.monarchinitiative.org/api/search/entity/TP53?rows=1" | jq '.docs[0].label'

echo "11. FDA API:"
curl -s "https://api.fda.gov/drug/label.json?search=aspirin&limit=1" | jq '.results[0].openfda.brand_name[0]'

echo "12. Europe PMC API:"
curl -s "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=TP53&format=json&pageSize=1" | jq '.resultList.result[0].title'

echo "Done!"
