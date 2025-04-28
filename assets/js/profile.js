document.addEventListener("DOMContentLoaded", function () {
    fetch('data/profile.yml')
      .then(response => response.text())
      .then(yamlText => {
        const data = jsyaml.load(yamlText);
  
        insertList('affiliation-list', data.affiliation);
        insertList('education-list', data.education);
        insertList('contact-list', data.contact);
        insertIconLinks('links-list', data.links);
        insertList('career-list', data.career);
        insertList('academicC', data.academicC);
        insertList('society-list', data.society);
        insertList('internship-list', data.internship);
      })
      .catch(err => {
        console.error('Error loading profile:', err);
      });
  });
  
  function insertList(elementId, items) {
    const ul = document.getElementById(elementId);
    if (!ul) return;
    items.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    });
  }
  
  // NEW: アイコン付きリンク
  function insertIconLinks(elementId, links) {
    const container = document.getElementById(elementId);
    if (!container) return;
  
    const iconMap = {
      "ORCID": "https://upload.wikimedia.org/wikipedia/commons/0/06/ORCID_iD.svg",
      "researchmap": "https://researchmap.jp/favicon.ico", // 代用
      "GitHub": "https://github.githubassets.com/favicons/favicon.png",
      "Twitter": "https://about.x.com/content/dam/about-twitter/x/brand-toolkit/logo-black.png.twimg.1920.png",
      "LinkedIn": "https://static.licdn.com/scds/common/u/images/logos/favicons/v1/favicon.ico",
      "Google Scholar": "https://scholar.google.com/favicon.ico"
    };
  
    links.forEach((link, idx) => {
      const a = document.createElement('a');
      a.href = link.url;
      a.target = "_blank";
      a.style.margin = "0 5px";
  
      const img = document.createElement('img');
      img.src = iconMap[link.name] || "";
      img.alt = link.name;
      img.width = 24;
      img.height = 24;
      img.style.verticalAlign = "middle";
  
      a.appendChild(img);
      container.appendChild(a);
  
      // スラッシュ区切り（最後以外）
      if (idx !== links.length - 1) {
        const slash = document.createElement('span');
        slash.textContent = " / ";
        container.appendChild(slash);
      }
    });
  }
  