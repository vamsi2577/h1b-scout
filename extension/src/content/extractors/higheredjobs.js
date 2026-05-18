(function attachHigherEdJobsExtractor(root) {
  const { text } = root.VisaExtractors;

  function higheredContext() {
    return {
      companyName: text(".job-inst") || "",
      jobTitle: text("#jobtitle-header") || ""
    };
  }

  root.VisaExtractors.higheredjobs = higheredContext;
})(typeof globalThis !== "undefined" ? globalThis : window);
