document.addEventListener("DOMContentLoaded", function () {
    fetch('data/publications.sql.txt')
      .then(response => response.text())
      .then(text => {
        const entries = text.split('),').map(entry => entry.trim().replace(/^\(NULL,/, '').replace(/\)$/, ''));
        const publicationList = document.getElementById('publication-list');
  
        const categoryMap = {
          1: "Journal Papers",
          2: "International Conference Papers",
          3: "Discourses and Panels",
          4: "Domestic Conference Papers",
          5: "Patents",
          6: "Ph.D. Thesis",
          7: "Master's Thesis",
          8: "Bachelor's Thesis",
          9: "Books",
          10: "Technical Reports",
          11: "Bulletin Papers",
          12: "Competition, Oral Presentation, etc."
        };
  
        const categorized = {};
  
        entries.forEach(line => {
          const fields = line.split(/,(?=(?:[^']*'[^']*')*[^']*$)/).map(field => {
            const clean = field.trim().replace(/^'|'$/g, '').replace(/^"|"$/g, '');
            return (clean.toLowerCase() === "null" || clean === "") ? null : clean;
          });
  
          if (fields.length < 24) return;
  
          const category = parseInt(fields[0]);
          if (!categorized[category]) categorized[category] = [];
          categorized[category].push({
            firstAuthor: fields[1],
            authors: fields[2],
            title: fields[3],
            bookname: fields[4],
            issn: fields[5],
            volume: fields[6],
            number: fields[7],
            id: fields[8],
            pages: fields[9],
            publisher: fields[10],
            area: fields[11],
            state: fields[12],
            country: fields[13],
            lid: fields[14],
            year: fields[15],
            month: fields[16],
            day: fields[17],
            doi: fields[18],
            award: fields[19],
            note: fields[20],
            pdfUrl: fields[21],
            abstract: fields[23]
          });
        });
  
        for (const [catId, pubs] of Object.entries(categorized)) {
          const section = document.createElement('section');
          const heading = document.createElement('h3');
          heading.textContent = categoryMap[catId] || "Other";
          section.appendChild(heading);
  
          const ul = document.createElement('ul');
  
          pubs.forEach(pub => {
            const li = document.createElement('li');
  
            // Author（自分の名前だけ特別に丸＋アンダーバー）
            let authors = pub.authors ? pub.authors.replace(
              /(Naoki Yoshimaru|吉丸 直希)/g,
              '<span class="my-name">◯$1</span>'
            ) : "";
  
            let parts = [];
            if (authors) parts.push(`${authors}:`);
            if (pub.title) parts.push(`"${pub.title}"`);
            if (pub.bookname) parts.push(`<em>${pub.bookname}</em>`);
            if (pub.publisher) parts.push(pub.publisher);
            if (pub.volume) parts.push(`Vol.${pub.volume}`);
            if (pub.number) parts.push(`No.${pub.number}`);
            if (pub.pages) parts.push(`pp.${pub.pages}`);
            if (pub.area || pub.country) parts.push(`${pub.area || pub.country}`);
            if (pub.month && pub.year) parts.push(`${monthName(pub.month)} ${pub.year}`);
            else if (pub.year) parts.push(`${pub.year}`);
  
            let entry = parts.join(', ');
  
            // DOI・PDFリンク
            if (pub.doi) {
              entry += `. DOI: <a href="https://doi.org/${pub.doi}" target="_blank">${pub.doi}</a>`;
            }
            if (pub.pdfUrl) {
              entry += ` [<a href="${pub.pdfUrl}" target="_blank">pdf</a>]`;
            }
  
            // Award（最後に追加）
            if (pub.award) {
              entry += ` <span class="award">(${pub.award})</span>`;
            }
  
            li.innerHTML = entry;
            ul.appendChild(li);
          });
  
          section.appendChild(ul);
          publicationList.appendChild(section);
        }
      })
      .catch(err => {
        console.error('Error loading publications:', err);
        const publicationList = document.getElementById('publication-list');
        publicationList.innerHTML = '<p>Failed to load publications.</p>';
      });
  });
  
  function monthName(monthNum) {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return monthNames[monthNum - 1] || "";
  }
  